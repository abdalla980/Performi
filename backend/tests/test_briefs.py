from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.guardrail import GuardrailReport
from app.models.launch import LaunchRecord
from tests.conftest import make_supabase_jwt


def _agency_and_client(db_session):
    agency = Agency(supabase_user_id="sb-briefs-1", name="Acme", email="briefs@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Client A")
    db_session.add(client_row)
    db_session.commit()
    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}
    return client_row, headers


def test_submit_brief_creates_pending_draft(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_row, headers = _agency_and_client(db_session)

    response = client.post(
        "/briefs",
        json={
            "client_id": str(client_row.id),
            "business_description": "Local bakery in Austin",
            "budget_usd": 500,
            "goals": "Drive foot traffic",
        },
        headers=headers,
    )

    assert response.status_code == 201
    assert response.json()["status"] == "pending_generation"

    main.app.dependency_overrides.clear()


def test_submit_brief_rejects_client_from_another_agency(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_row, _ = _agency_and_client(db_session)

    other_agency = Agency(supabase_user_id="sb-briefs-2", name="Other", email="other@acme.test")
    db_session.add(other_agency)
    db_session.commit()
    other_headers = {"Authorization": f"Bearer {make_supabase_jwt(other_agency.supabase_user_id)}"}

    response = client.post(
        "/briefs",
        json={
            "client_id": str(client_row.id),
            "business_description": "Local bakery in Austin",
            "budget_usd": 500,
            "goals": "Drive foot traffic",
        },
        headers=other_headers,
    )

    assert response.status_code == 404

    main.app.dependency_overrides.clear()


def test_submit_briefs_batch_creates_one_draft_per_client(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_a, headers = _agency_and_client(db_session)
    client_b = Client(agency_id=client_a.agency_id, name="Client B")
    db_session.add(client_b)
    db_session.commit()

    response = client.post(
        "/briefs/batch",
        json={
            "briefs": [
                {
                    "client_id": str(client_a.id),
                    "business_description": "Bakery",
                    "budget_usd": 500,
                    "goals": "Foot traffic",
                },
                {
                    "client_id": str(client_b.id),
                    "business_description": "Plumber",
                    "budget_usd": 800,
                    "goals": "Emergency calls",
                },
            ]
        },
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert len(body) == 2
    assert {row["client_name"] for row in body} == {"Client A", "Client B"}
    assert all(row["status"] == "pending_generation" for row in body)

    main.app.dependency_overrides.clear()


def test_list_briefs_returns_all_drafts_for_agency(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_row, headers = _agency_and_client(db_session)

    client.post(
        "/briefs",
        json={
            "client_id": str(client_row.id),
            "business_description": "Local bakery in Austin",
            "budget_usd": 500,
            "goals": "Drive foot traffic",
        },
        headers=headers,
    )

    response = client.get("/briefs", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["client_name"] == "Client A"
    assert body[0]["guardrail_flag_count"] == 0
    assert body[0]["has_blocking_flags"] is False

    main.app.dependency_overrides.clear()


def test_list_briefs_excludes_other_agencys_drafts(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_row, headers = _agency_and_client(db_session)

    client.post(
        "/briefs",
        json={
            "client_id": str(client_row.id),
            "business_description": "Local bakery in Austin",
            "budget_usd": 500,
            "goals": "Drive foot traffic",
        },
        headers=headers,
    )

    other_agency = Agency(supabase_user_id="sb-briefs-3", name="Other", email="other2@acme.test")
    db_session.add(other_agency)
    db_session.commit()
    other_headers = {"Authorization": f"Bearer {make_supabase_jwt(other_agency.supabase_user_id)}"}

    response = client.get("/briefs", headers=other_headers)

    assert response.status_code == 200
    assert response.json() == []

    main.app.dependency_overrides.clear()


def test_get_brief_detail_returns_full_draft(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_row, headers = _agency_and_client(db_session)

    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Foot traffic")
    db_session.add(brief)
    db_session.flush()
    draft = CampaignDraft(
        brief_id=brief.id,
        status="guardrail_checked",
        google_plan_json={
            "campaign_name": "Bakery Campaign",
            "daily_budget_micros": 16_000_000,
            "end_date": None,
            "ad_groups": [],
        },
        meta_plan_json={"campaign_name": "Bakery Campaign", "objective": "traffic", "ad_sets": []},
    )
    db_session.add(draft)
    db_session.flush()
    report = GuardrailReport(campaign_draft_id=draft.id, flags_json=[], has_blocking_flags=False)
    launch = LaunchRecord(
        campaign_draft_id=draft.id, platform="google", status="success", external_campaign_id="ext-1"
    )
    db_session.add_all([report, launch])
    db_session.commit()

    response = client.get(f"/briefs/{draft.id}", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["client_name"] == "Client A"
    assert body["google_plan"]["campaign_name"] == "Bakery Campaign"
    assert body["meta_plan"]["objective"] == "traffic"
    assert body["guardrail"]["has_blocking_flags"] is False
    assert body["launches"][0]["external_campaign_id"] == "ext-1"

    main.app.dependency_overrides.clear()


def test_get_brief_detail_rejects_other_agency(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_row, _ = _agency_and_client(db_session)

    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Foot traffic")
    db_session.add(brief)
    db_session.flush()
    draft = CampaignDraft(brief_id=brief.id)
    db_session.add(draft)
    db_session.commit()

    other_agency = Agency(supabase_user_id="sb-briefs-4", name="Other", email="other3@acme.test")
    db_session.add(other_agency)
    db_session.commit()
    other_headers = {"Authorization": f"Bearer {make_supabase_jwt(other_agency.supabase_user_id)}"}

    response = client.get(f"/briefs/{draft.id}", headers=other_headers)

    assert response.status_code == 404

    main.app.dependency_overrides.clear()
