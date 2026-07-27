from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.guardrail import GuardrailReport
from tests.conftest import make_supabase_jwt


def _agency_and_client(db_session):
    agency = Agency(supabase_user_id="sb-stats-1", name="Acme", email="stats@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Client A")
    db_session.add(client_row)
    db_session.commit()
    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}
    return client_row, headers


def test_computes_launched_count_and_hours_saved(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_row, headers = _agency_and_client(db_session)

    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    db_session.add(CampaignDraft(brief_id=brief.id, status="launched"))
    brief2 = Brief(client_id=client_row.id, business_description="Bakery 2", budget_usd=500, goals="Traffic")
    db_session.add(brief2)
    db_session.flush()
    db_session.add(CampaignDraft(brief_id=brief2.id, status="adapted"))  # not launched — excluded
    db_session.commit()

    response = client.get("/stats/impact", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["campaigns_launched"] == 1
    assert body["estimated_hours_saved"] == 2.0

    main.app.dependency_overrides.clear()


def test_sums_guardrail_issues_across_all_drafts(client, db_session):
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
            flags_json=[{"severity": "warn", "code": "a", "message": "m1"}, {"severity": "block", "code": "b", "message": "m2"}],
            has_blocking_flags=True,
        )
    )
    db_session.commit()

    response = client.get("/stats/impact", headers=headers)

    assert response.status_code == 200
    assert response.json()["guardrail_issues_caught"] == 2

    main.app.dependency_overrides.clear()


def test_scopes_to_the_requesting_agency(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_and_client(db_session)

    other_agency = Agency(supabase_user_id="sb-stats-2", name="Other", email="other@acme.test")
    db_session.add(other_agency)
    db_session.flush()
    other_client = Client(agency_id=other_agency.id, name="Other Client")
    db_session.add(other_client)
    db_session.flush()
    other_brief = Brief(client_id=other_client.id, business_description="X", budget_usd=100, goals="Y")
    db_session.add(other_brief)
    db_session.flush()
    db_session.add(CampaignDraft(brief_id=other_brief.id, status="launched"))
    db_session.commit()

    response = client.get("/stats/impact", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["campaigns_launched"] == 0
    assert body["guardrail_issues_caught"] == 0

    main.app.dependency_overrides.clear()
