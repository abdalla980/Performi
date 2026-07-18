from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.schemas.campaign_ir import AdCopyVariant, CampaignIR
from app.services.google_adapter import adapt_to_google
from app.services.meta_adapter import adapt_to_meta
from tests.conftest import make_supabase_jwt


def _draft(
    db_session,
    google_connected=True,
    meta_connected=False,
    status="client_approved",
    google_demo=False,
    meta_demo=False,
):
    agency = Agency(supabase_user_id="sb-launch-1", name="Acme", email="launch@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(
        agency_id=agency.id,
        name="Client A",
        google_ads_customer_id=("demo-fake0001" if google_demo else "123-456-7890") if google_connected else None,
        google_refresh_token_encrypted=b"not-real-encrypted-bytes" if google_connected else None,
        meta_ad_account_id=("demo-fake0001" if meta_demo else "act_999") if meta_connected else None,
        meta_access_token_encrypted=b"not-real-encrypted-bytes" if meta_connected else None,
    )
    db_session.add(client_row)
    db_session.flush()
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
        google_plan_json=adapt_to_google(ir).model_dump(mode="json") if google_connected else None,
        meta_plan_json=adapt_to_meta(ir).model_dump(mode="json") if meta_connected else None,
    )
    db_session.add(draft)
    db_session.commit()
    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}
    return draft, headers


def test_launch_pushes_to_google_and_records_success(client, db_session, monkeypatch):
    from app import main
    from app.routers import launches
    from app.services.google_ads_client import FakeGoogleAdsPushClient

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr("app.services.campaign_push.decrypt_token", lambda blob: "decrypted-token")
    monkeypatch.setattr(
        launches, "get_google_ads_push_client", lambda: FakeGoogleAdsPushClient(external_id="google-camp-1")
    )
    draft, headers = _draft(db_session)

    response = client.post(f"/briefs/{draft.id}/launch", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "launched"
    assert body["external_campaign_id"] == "google-camp-1"
    assert body["platforms"] == [
        {"platform": "google", "status": "success", "external_campaign_id": "google-camp-1", "error_message": None}
    ]

    main.app.dependency_overrides.clear()


def test_launch_records_failure_without_crashing(client, db_session, monkeypatch):
    from app import main
    from app.routers import launches
    from app.services.google_ads_client import FakeGoogleAdsPushClient

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr("app.services.campaign_push.decrypt_token", lambda blob: "decrypted-token")
    monkeypatch.setattr("app.services.campaign_push._BACKOFF_SECONDS", 0)
    monkeypatch.setattr(
        launches,
        "get_google_ads_push_client",
        lambda: FakeGoogleAdsPushClient(raise_error=RuntimeError("quota exceeded")),
    )
    draft, headers = _draft(db_session)

    response = client.post(f"/briefs/{draft.id}/launch", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert "quota exceeded" in body["error_message"]

    main.app.dependency_overrides.clear()


def test_launch_pushes_to_both_platforms_independently(client, db_session, monkeypatch):
    from app import main
    from app.routers import launches
    from app.services.google_ads_client import FakeGoogleAdsPushClient
    from app.services.meta_ads_client import FakeMetaAdsPushClient

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr("app.services.campaign_push.decrypt_token", lambda blob: "decrypted-token")
    monkeypatch.setattr("app.services.campaign_push._BACKOFF_SECONDS", 0)
    monkeypatch.setattr(
        launches, "get_google_ads_push_client", lambda: FakeGoogleAdsPushClient(raise_error=RuntimeError("down"))
    )
    monkeypatch.setattr(
        launches, "get_meta_ads_push_client", lambda: FakeMetaAdsPushClient(external_id="meta-camp-1")
    )
    draft, headers = _draft(db_session, google_connected=True, meta_connected=True)

    response = client.post(f"/briefs/{draft.id}/launch", headers=headers)

    assert response.status_code == 200
    body = response.json()
    # Google failed but Meta succeeded, so the overall launch still counts as launched.
    assert body["status"] == "launched"
    assert body["external_campaign_id"] == "meta-camp-1"
    by_platform = {p["platform"]: p for p in body["platforms"]}
    assert by_platform["google"]["status"] == "failed"
    assert by_platform["meta"]["status"] == "success"

    main.app.dependency_overrides.clear()


def test_launch_uses_demo_push_for_demo_connected_google_client(client, db_session, monkeypatch):
    """Regression test: a demo-connected client (google/demo-connect) must not fall
    through to RealGoogleAdsPushClient, which would burn retries calling the real API
    with fabricated credentials and always report status=failed. No dependency
    override here — this exercises the actual default client the route wires up."""
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr("app.services.campaign_push.decrypt_token", lambda blob: "demo-google-refresh-token")
    draft, headers = _draft(db_session, google_connected=True, google_demo=True)

    response = client.post(f"/briefs/{draft.id}/launch", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "launched"
    assert body["platforms"] == [
        {"platform": "google", "status": "success", "external_campaign_id": "demo-google-demo-fake0001", "error_message": None}
    ]

    main.app.dependency_overrides.clear()


def test_launch_uses_demo_push_for_demo_connected_meta_client(client, db_session, monkeypatch):
    """Same regression, Meta side: META_APP_ID/SECRET are real and configured in this
    dev environment, so a naive "is meta configured" check would still misroute a
    demo-connected client's fake token straight to the real Graph API."""
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr("app.services.campaign_push.decrypt_token", lambda blob: "demo-meta-access-token")
    draft, headers = _draft(db_session, google_connected=False, meta_connected=True, meta_demo=True)

    response = client.post(f"/briefs/{draft.id}/launch", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "launched"
    assert body["platforms"] == [
        {"platform": "meta", "status": "success", "external_campaign_id": "demo-meta-demo-fake0001", "error_message": None}
    ]

    main.app.dependency_overrides.clear()


def test_launch_rejects_draft_with_no_connected_platform(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    draft, headers = _draft(db_session, google_connected=False, meta_connected=False)

    response = client.post(f"/briefs/{draft.id}/launch", headers=headers)

    assert response.status_code == 400

    main.app.dependency_overrides.clear()


def test_launch_rejects_draft_that_is_not_client_approved(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    draft, headers = _draft(db_session, status="approved")

    response = client.post(f"/briefs/{draft.id}/launch", headers=headers)

    assert response.status_code == 409

    main.app.dependency_overrides.clear()
