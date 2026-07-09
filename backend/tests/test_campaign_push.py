from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.launch import LaunchRecord
from app.schemas.campaign_ir import AdCopyVariant, CampaignIR
from app.services.google_adapter import adapt_to_google
from app.services.meta_adapter import adapt_to_meta
from app.services.google_ads_client import FakeGoogleAdsPushClient
from app.services.meta_ads_client import FakeMetaAdsPushClient
from app.services.campaign_push import push_draft_with_clients


def _draft(db_session, google_connected=True, meta_connected=True) -> CampaignDraft:
    agency = Agency(supabase_user_id="sb-push-1", name="Acme", email="push@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(
        agency_id=agency.id,
        name="Client A",
        google_ads_customer_id="123-456-7890" if google_connected else None,
        google_refresh_token_encrypted=b"encrypted" if google_connected else None,
        meta_ad_account_id="act_999" if meta_connected else None,
        meta_access_token_encrypted=b"encrypted" if meta_connected else None,
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
        status="approved",
        ir_json=ir.model_dump(mode="json"),
        google_plan_json=adapt_to_google(ir).model_dump(mode="json"),
        meta_plan_json=adapt_to_meta(ir).model_dump(mode="json"),
    )
    db_session.add(draft)
    db_session.commit()
    return draft


def test_push_draft_writes_success_launch_records_for_both_platforms(db_session, monkeypatch):
    monkeypatch.setattr("app.services.campaign_push.decrypt_token", lambda blob: "decrypted-token")
    draft = _draft(db_session)

    push_draft_with_clients(
        db_session,
        draft.id,
        google_client=FakeGoogleAdsPushClient(external_id="google-camp-1"),
        meta_client=FakeMetaAdsPushClient(external_id="meta-camp-1"),
    )

    records = db_session.query(LaunchRecord).filter_by(campaign_draft_id=draft.id).all()
    by_platform = {r.platform: r for r in records}
    assert by_platform["google"].status == "success"
    assert by_platform["google"].external_campaign_id == "google-camp-1"
    assert by_platform["meta"].status == "success"
    assert by_platform["meta"].external_campaign_id == "meta-camp-1"


def test_push_draft_records_failure_independently_per_platform(db_session, monkeypatch):
    monkeypatch.setattr("app.services.campaign_push.decrypt_token", lambda blob: "decrypted-token")
    draft = _draft(db_session)

    push_draft_with_clients(
        db_session,
        draft.id,
        google_client=FakeGoogleAdsPushClient(raise_error=RuntimeError("quota exceeded")),
        meta_client=FakeMetaAdsPushClient(external_id="meta-camp-1"),
        sleep_fn=lambda _seconds: None,
    )

    records = db_session.query(LaunchRecord).filter_by(campaign_draft_id=draft.id).all()
    by_platform = {r.platform: r for r in records}
    assert by_platform["google"].status == "failed"
    assert "quota exceeded" in by_platform["google"].error_message
    assert by_platform["meta"].status == "success"


def test_push_draft_only_pushes_connected_platforms(db_session, monkeypatch):
    monkeypatch.setattr("app.services.campaign_push.decrypt_token", lambda blob: "decrypted-token")
    draft = _draft(db_session, google_connected=True, meta_connected=False)

    push_draft_with_clients(
        db_session,
        draft.id,
        google_client=FakeGoogleAdsPushClient(external_id="google-camp-1"),
        meta_client=FakeMetaAdsPushClient(external_id="meta-camp-1"),
    )

    records = db_session.query(LaunchRecord).filter_by(campaign_draft_id=draft.id).all()
    assert len(records) == 1
    assert records[0].platform == "google"
