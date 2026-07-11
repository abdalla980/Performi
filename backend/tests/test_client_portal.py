from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.schemas.campaign_ir import AdCopyVariant, CampaignIR
from app.services.google_adapter import adapt_to_google
from tests.conftest import make_supabase_jwt


def _agency_and_client(db_session, client_supabase_user_id="sb-client-1"):
    agency = Agency(supabase_user_id="sb-agency-portal-1", name="Acme", email="portal@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Acme Bakery", supabase_user_id=client_supabase_user_id)
    db_session.add(client_row)
    db_session.commit()
    headers = {"Authorization": f"Bearer {make_supabase_jwt(client_supabase_user_id)}"}
    return agency, client_row, headers


def _draft(db_session, client_row, status):
    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    ir = CampaignIR(
        campaign_name="Austin Bakery",
        objective="traffic",
        daily_budget_usd=16.5,
        keywords=["bakery near me"],
        audience_description="Adults 25-54 near Austin",
        ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
        call_to_action="Visit Us Today",
    )
    draft = CampaignDraft(
        brief_id=brief.id,
        status=status,
        ir_json=ir.model_dump(mode="json"),
        google_plan_json=adapt_to_google(ir).model_dump(mode="json"),
    )
    db_session.add(draft)
    db_session.commit()
    return draft


def test_list_campaigns_only_shows_agency_approved_onward(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, client_row, headers = _agency_and_client(db_session)
    _draft(db_session, client_row, status="adapted")
    visible = _draft(db_session, client_row, status="approved")

    response = client.get("/portal/campaigns", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == str(visible.id)

    main.app.dependency_overrides.clear()


def test_list_campaigns_excludes_other_clients(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, client_row, headers = _agency_and_client(db_session)
    agency2 = Agency(supabase_user_id="sb-agency-portal-2", name="Other", email="other-portal@acme.test")
    db_session.add(agency2)
    db_session.flush()
    other_client = Client(agency_id=agency2.id, name="Other Client", supabase_user_id="sb-client-2")
    db_session.add(other_client)
    db_session.commit()
    _draft(db_session, other_client, status="approved")

    response = client.get("/portal/campaigns", headers=headers)

    assert response.status_code == 200
    assert response.json() == []

    main.app.dependency_overrides.clear()


def test_get_campaign_detail_includes_plan_and_projected_metrics_but_not_internal_fields(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, client_row, headers = _agency_and_client(db_session)
    draft = _draft(db_session, client_row, status="approved")

    response = client.get(f"/portal/campaigns/{draft.id}", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["google_plan"]["campaign_name"] == "Austin Bakery"
    assert body["projected_metrics"]["platforms"]
    assert "guardrail" not in body
    assert "competitors" not in body
    assert "excluded_keywords" not in body
    assert "unique_selling_points" not in body

    main.app.dependency_overrides.clear()


def test_get_campaign_detail_404_for_not_yet_agency_approved(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, client_row, headers = _agency_and_client(db_session)
    draft = _draft(db_session, client_row, status="guardrail_checked")

    response = client.get(f"/portal/campaigns/{draft.id}", headers=headers)

    assert response.status_code == 404

    main.app.dependency_overrides.clear()


def test_decide_campaign_approves(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, client_row, headers = _agency_and_client(db_session)
    draft = _draft(db_session, client_row, status="approved")

    response = client.post(f"/portal/campaigns/{draft.id}/decision", json={"decision": "approved"}, headers=headers)

    assert response.status_code == 200
    assert response.json()["status"] == "client_approved"

    main.app.dependency_overrides.clear()


def test_decide_campaign_rejects(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, client_row, headers = _agency_and_client(db_session)
    draft = _draft(db_session, client_row, status="approved")

    response = client.post(f"/portal/campaigns/{draft.id}/decision", json={"decision": "rejected"}, headers=headers)

    assert response.status_code == 200
    assert response.json()["status"] == "client_rejected"

    main.app.dependency_overrides.clear()


def test_decide_campaign_rejects_when_not_awaiting_approval(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, client_row, headers = _agency_and_client(db_session)
    draft = _draft(db_session, client_row, status="adapted")

    response = client.post(f"/portal/campaigns/{draft.id}/decision", json={"decision": "approved"}, headers=headers)

    assert response.status_code == 409

    main.app.dependency_overrides.clear()


def test_decide_campaign_404_for_other_clients_campaign(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, client_row, headers = _agency_and_client(db_session)
    agency2 = Agency(supabase_user_id="sb-agency-portal-3", name="Other", email="other-portal2@acme.test")
    db_session.add(agency2)
    db_session.flush()
    other_client = Client(agency_id=agency2.id, name="Other Client", supabase_user_id="sb-client-3")
    db_session.add(other_client)
    db_session.commit()
    draft = _draft(db_session, other_client, status="approved")

    response = client.post(f"/portal/campaigns/{draft.id}/decision", json={"decision": "approved"}, headers=headers)

    assert response.status_code == 404

    main.app.dependency_overrides.clear()
