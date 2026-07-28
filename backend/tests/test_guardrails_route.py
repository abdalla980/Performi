import json
from types import SimpleNamespace

from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from tests.conftest import make_supabase_jwt
from tests.ir_fixtures import make_campaign_ir

_CLEAN_FLAGS_JSON = json.dumps({"flags": []})
_WOULD_HAVE_FLAGGED_JSON = json.dumps(
    {"flags": [{"severity": "warn", "code": "would_have_flagged", "message": "semantic check ran"}]}
)


class _FakeMessages:
    def create(self, **kwargs):
        return SimpleNamespace(content=[SimpleNamespace(text=_CLEAN_FLAGS_JSON)])


class FakeAnthropic:
    def __init__(self, *args, **kwargs):
        self.messages = _FakeMessages()


class _FakeMessagesThatWouldFlag:
    def create(self, **kwargs):
        return SimpleNamespace(content=[SimpleNamespace(text=_WOULD_HAVE_FLAGGED_JSON)])


class FakeAnthropicThatWouldFlag:
    """A fake configured to always return a flag -- used to prove the semantic check
    genuinely ran (or genuinely didn't), rather than a clean-flags result being
    ambiguous between "ran and found nothing" and "was skipped entirely"."""

    def __init__(self, *args, **kwargs):
        self.messages = _FakeMessagesThatWouldFlag()


def test_run_guardrails_returns_clean_report_for_a_clean_draft(client, db_session, monkeypatch):
    from app import main
    from app.routers import guardrails

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(guardrails, "Anthropic", FakeAnthropic)

    agency = Agency(supabase_user_id="sb-guard-1", name="Acme", email="guard@acme.test")
    db_session.add(agency)
    db_session.flush()
    # Real connection so this test exercises the actual live-semantic-check path (see
    # the would-flag tests below for proof it genuinely runs vs. is genuinely skipped).
    client_row = Client(agency_id=agency.id, name="Client A", google_ads_customer_id="1234567890")
    db_session.add(client_row)
    db_session.flush()
    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    ir = make_campaign_ir()
    draft = CampaignDraft(brief_id=brief.id, status="adapted", ir_json=ir.model_dump(mode="json"))
    db_session.add(draft)
    db_session.commit()

    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}
    response = client.post(f"/briefs/{draft.id}/guardrails/run", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["has_blocking_flags"] is False
    assert body["flags"] == []

    main.app.dependency_overrides.clear()


def test_run_guardrails_runs_semantic_check_when_client_has_real_connection(client, db_session, monkeypatch):
    from app import main
    from app.config import get_settings
    from app.routers import guardrails

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(guardrails, "Anthropic", FakeAnthropicThatWouldFlag)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-key")
    get_settings.cache_clear()

    agency = Agency(supabase_user_id="sb-guard-conn", name="Acme", email="guard-conn@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Client A", meta_ad_account_id="act_12345")
    db_session.add(client_row)
    db_session.flush()
    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    ir = make_campaign_ir()
    draft = CampaignDraft(brief_id=brief.id, status="adapted", ir_json=ir.model_dump(mode="json"))
    db_session.add(draft)
    db_session.commit()

    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}
    response = client.post(f"/briefs/{draft.id}/guardrails/run", headers=headers)

    assert response.status_code == 200
    codes = {f["code"] for f in response.json()["flags"]}
    assert "would_have_flagged" in codes

    get_settings.cache_clear()
    main.app.dependency_overrides.clear()


def test_run_guardrails_skips_semantic_check_when_client_has_no_real_connection(client, db_session, monkeypatch):
    """ANTHROPIC_API_KEY is configured, but this client has no real platform
    connection -- proves the semantic check is genuinely skipped (not just coincidentally
    clean) via a fake that would always flag something if it were actually called."""
    from app import main
    from app.config import get_settings
    from app.routers import guardrails

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(guardrails, "Anthropic", FakeAnthropicThatWouldFlag)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-key")
    get_settings.cache_clear()

    agency = Agency(supabase_user_id="sb-guard-noconn", name="Acme", email="guard-noconn@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Client A")  # no connection at all
    db_session.add(client_row)
    db_session.flush()
    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    ir = make_campaign_ir()
    draft = CampaignDraft(brief_id=brief.id, status="adapted", ir_json=ir.model_dump(mode="json"))
    db_session.add(draft)
    db_session.commit()

    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}
    response = client.post(f"/briefs/{draft.id}/guardrails/run", headers=headers)

    assert response.status_code == 200
    assert response.json()["flags"] == []

    get_settings.cache_clear()
    main.app.dependency_overrides.clear()


def test_run_guardrails_skips_semantic_check_when_anthropic_not_configured(client, db_session, monkeypatch):
    from app import main
    from app.config import get_settings

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    get_settings.cache_clear()

    agency = Agency(supabase_user_id="sb-guard-2", name="Acme", email="guard2@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Client A")
    db_session.add(client_row)
    db_session.flush()
    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    ir = make_campaign_ir()
    draft = CampaignDraft(brief_id=brief.id, status="adapted", ir_json=ir.model_dump(mode="json"))
    db_session.add(draft)
    db_session.commit()

    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}
    response = client.post(f"/briefs/{draft.id}/guardrails/run", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["has_blocking_flags"] is False
    assert body["flags"] == []

    get_settings.cache_clear()
    main.app.dependency_overrides.clear()
