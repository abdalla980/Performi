from datetime import datetime, timedelta, timezone

from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.guardrail import GuardrailReport
from tests.conftest import make_supabase_jwt


def _agency_and_client(db_session):
    agency = Agency(supabase_user_id="sb-notif-1", name="Acme", email="notif@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Client A")
    db_session.add(client_row)
    db_session.commit()
    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}
    return client_row, headers


def test_flags_stale_pending_agency_approval(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_row, headers = _agency_and_client(db_session)

    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    draft = CampaignDraft(brief_id=brief.id, status="guardrail_checked")
    db_session.add(draft)
    db_session.commit()
    draft.updated_at = datetime.now(timezone.utc) - timedelta(days=4)
    db_session.commit()

    response = client.get("/notifications", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["kind"] == "pending_approval_stale"
    assert body[0]["client_name"] == "Client A"
    assert body[0]["days_stale"] >= 4

    main.app.dependency_overrides.clear()


def test_flags_blocked_guardrail_regardless_of_staleness(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_row, headers = _agency_and_client(db_session)

    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    draft = CampaignDraft(brief_id=brief.id, status="guardrail_checked")
    db_session.add(draft)
    db_session.flush()
    db_session.add(
        GuardrailReport(
            campaign_draft_id=draft.id,
            flags_json=[{"severity": "block", "code": "x", "message": "bad"}],
            has_blocking_flags=True,
        )
    )
    db_session.commit()

    response = client.get("/notifications", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["kind"] == "guardrail_blocked"

    main.app.dependency_overrides.clear()


def test_excludes_fresh_drafts(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_row, headers = _agency_and_client(db_session)

    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    db_session.add(CampaignDraft(brief_id=brief.id, status="guardrail_checked"))
    db_session.commit()

    response = client.get("/notifications", headers=headers)

    assert response.status_code == 200
    assert response.json() == []

    main.app.dependency_overrides.clear()


def test_scopes_to_the_requesting_agency(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_and_client(db_session)

    other_agency = Agency(supabase_user_id="sb-notif-2", name="Other", email="other@acme.test")
    db_session.add(other_agency)
    db_session.flush()
    other_client = Client(agency_id=other_agency.id, name="Other Client")
    db_session.add(other_client)
    db_session.flush()
    other_brief = Brief(client_id=other_client.id, business_description="X", budget_usd=100, goals="Y")
    db_session.add(other_brief)
    db_session.flush()
    db_session.add(CampaignDraft(brief_id=other_brief.id, status="failed"))
    db_session.commit()

    response = client.get("/notifications", headers=headers)

    assert response.status_code == 200
    assert response.json() == []

    main.app.dependency_overrides.clear()
