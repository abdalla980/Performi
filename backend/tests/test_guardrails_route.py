import json
from types import SimpleNamespace

from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.schemas.campaign_ir import AdCopyVariant, CampaignIR
from tests.conftest import make_supabase_jwt

_CLEAN_FLAGS_JSON = json.dumps({"flags": []})


class _FakeMessages:
    def create(self, **kwargs):
        return SimpleNamespace(content=[SimpleNamespace(text=_CLEAN_FLAGS_JSON)])


class FakeAnthropic:
    def __init__(self, *args, **kwargs):
        self.messages = _FakeMessages()


def test_run_guardrails_returns_clean_report_for_a_clean_draft(client, db_session, monkeypatch):
    from app import main
    from app.routers import guardrails

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(guardrails, "Anthropic", FakeAnthropic)

    agency = Agency(supabase_user_id="sb-guard-1", name="Acme", email="guard@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Client A")
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
    ir = CampaignIR(
        campaign_name="Austin Bakery",
        objective="traffic",
        daily_budget_usd=16.5,
        keywords=["bakery near me"],
        audience_description="Adults 25-54 near Austin",
        ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
        call_to_action="Visit Us Today",
    )
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
