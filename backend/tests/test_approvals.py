from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.guardrail import GuardrailReport
from app.schemas.campaign_ir import AdCopyVariant, CampaignIR
from tests.conftest import make_supabase_jwt

_IR = CampaignIR(
    campaign_name="Austin Bakery",
    objective="traffic",
    daily_budget_usd=16.5,
    keywords=["bakery near me"],
    audience_description="Adults 25-54 near Austin",
    ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
    call_to_action="Visit Us Today",
).model_dump(mode="json")


def _setup(db_session, has_blocking_flags: bool):
    agency = Agency(
        supabase_user_id=f"sb-approvals-{has_blocking_flags}",
        name="Acme",
        email=f"approvals{has_blocking_flags}@acme.test",
    )
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Client A")
    db_session.add(client_row)
    db_session.flush()
    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    draft = CampaignDraft(brief_id=brief.id, ir_json=_IR, status="guardrail_checked")
    db_session.add(draft)
    db_session.flush()
    report = GuardrailReport(campaign_draft_id=draft.id, flags_json=[], has_blocking_flags=has_blocking_flags)
    db_session.add(report)
    db_session.commit()
    token = make_supabase_jwt(agency.supabase_user_id)
    return draft, {"Authorization": f"Bearer {token}"}


def test_approve_succeeds_when_no_blocking_flags(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    draft, headers = _setup(db_session, has_blocking_flags=False)

    response = client.post(
        f"/briefs/{draft.id}/approve",
        json={"decision": "approved", "edited_ir": None, "reviewer_note": "Looks good"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    main.app.dependency_overrides.clear()


def test_approve_blocked_when_report_has_blocking_flags(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    draft, headers = _setup(db_session, has_blocking_flags=True)

    response = client.post(
        f"/briefs/{draft.id}/approve",
        json={"decision": "approved", "edited_ir": None, "reviewer_note": None},
        headers=headers,
    )

    assert response.status_code == 409
    main.app.dependency_overrides.clear()


def test_reject_succeeds_even_with_blocking_flags(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    draft, headers = _setup(db_session, has_blocking_flags=True)

    response = client.post(
        f"/briefs/{draft.id}/approve",
        json={"decision": "rejected", "edited_ir": None, "reviewer_note": "Not on brand"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    main.app.dependency_overrides.clear()
