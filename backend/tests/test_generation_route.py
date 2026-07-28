import json
from types import SimpleNamespace

from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from tests.conftest import make_supabase_jwt
from tests.ir_fixtures import make_campaign_ir_json

_FAKE_IR_JSON = json.dumps(make_campaign_ir_json())


class _FakeMessages:
    def create(self, **kwargs):
        return SimpleNamespace(content=[SimpleNamespace(text=_FAKE_IR_JSON)])


class FakeAnthropic:
    def __init__(self, *args, **kwargs):
        self.messages = _FakeMessages()


def test_generate_draft_returns_google_plan(client, db_session, monkeypatch):
    from app import main
    from app.config import get_settings
    from app.routers import generation

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(generation, "Anthropic", FakeAnthropic)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-key")
    get_settings.cache_clear()

    agency = Agency(supabase_user_id="sb-gen-1", name="Acme", email="gen@acme.test")
    db_session.add(agency)
    db_session.flush()
    # A real (non-demo) platform connection is required for live mode -- a client with
    # none falls back to demo regardless of ANTHROPIC_API_KEY (see the
    # falls_back_to_demo_when_client_has_no_real_connection test below).
    client_row = Client(agency_id=agency.id, name="Client A", google_ads_customer_id="1234567890")
    db_session.add(client_row)
    db_session.flush()
    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    draft = CampaignDraft(brief_id=brief.id)
    db_session.add(draft)
    db_session.commit()

    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}
    response = client.post(f"/briefs/{draft.id}/generate", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "adapted"
    assert body["google_plan"]["campaign_name"] == "Austin Bakery Foot Traffic"
    assert body["google_plan"]["daily_budget_micros"] == 16_500_000
    assert body["meta_plan"]["campaign_name"] == "Austin Bakery Foot Traffic"
    assert body["meta_plan"]["ad_sets"][0]["daily_budget_cents"] == 1650
    assert body["mode"] == "live"

    get_settings.cache_clear()
    main.app.dependency_overrides.clear()


def test_generate_draft_falls_back_to_demo_when_client_has_no_real_connection(client, db_session, monkeypatch):
    """ANTHROPIC_API_KEY is configured, but this client has no real platform
    connection (never connected, or only demo-connected) -- real AI should not be
    spent on a client that can't actually launch for real yet."""
    from app import main
    from app.config import get_settings
    from app.routers import generation

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(generation, "Anthropic", FakeAnthropic)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-key")
    get_settings.cache_clear()

    agency = Agency(supabase_user_id="sb-gen-noconn", name="Acme", email="gen-noconn@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Client A")  # no connection at all
    db_session.add(client_row)
    db_session.flush()
    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    draft = CampaignDraft(brief_id=brief.id)
    db_session.add(draft)
    db_session.commit()

    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}
    response = client.post(f"/briefs/{draft.id}/generate", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "demo"

    get_settings.cache_clear()
    main.app.dependency_overrides.clear()


def test_generate_draft_falls_back_to_demo_when_client_only_demo_connected(client, db_session, monkeypatch):
    """Same as above, but for a client that went through /demo-connect (stamped
    customer IDs prefixed "demo-") rather than never connecting at all."""
    from app import main
    from app.config import get_settings
    from app.routers import generation

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(generation, "Anthropic", FakeAnthropic)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-key")
    get_settings.cache_clear()

    agency = Agency(supabase_user_id="sb-gen-democonn", name="Acme", email="gen-democonn@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Client A", google_ads_customer_id="demo-abcd1234")
    db_session.add(client_row)
    db_session.flush()
    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    draft = CampaignDraft(brief_id=brief.id)
    db_session.add(draft)
    db_session.commit()

    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}
    response = client.post(f"/briefs/{draft.id}/generate", headers=headers)

    assert response.status_code == 200
    assert response.json()["mode"] == "demo"

    get_settings.cache_clear()
    main.app.dependency_overrides.clear()


def test_generate_draft_only_generates_selected_platforms(client, db_session, monkeypatch):
    from app import main
    from app.config import get_settings

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    get_settings.cache_clear()

    agency = Agency(supabase_user_id="sb-gen-platforms", name="Acme", email="gen-platforms@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Client A")
    db_session.add(client_row)
    db_session.flush()
    brief = Brief(
        client_id=client_row.id,
        business_description="Bakery",
        budget_usd=600,
        goals="Drive foot traffic",
        platforms=["google"],
    )
    db_session.add(brief)
    db_session.flush()
    draft = CampaignDraft(brief_id=brief.id)
    db_session.add(draft)
    db_session.commit()

    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}
    response = client.post(f"/briefs/{draft.id}/generate", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["google_plan"] is not None
    assert body["meta_plan"] is None

    get_settings.cache_clear()
    main.app.dependency_overrides.clear()


def test_generate_draft_falls_back_to_demo_when_anthropic_not_configured(client, db_session, monkeypatch):
    from app import main
    from app.config import get_settings

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    get_settings.cache_clear()

    agency = Agency(supabase_user_id="sb-gen-demo", name="Acme", email="gen-demo@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Client A")
    db_session.add(client_row)
    db_session.flush()
    brief = Brief(
        client_id=client_row.id, business_description="Bakery", budget_usd=600, goals="Drive foot traffic"
    )
    db_session.add(brief)
    db_session.flush()
    draft = CampaignDraft(brief_id=brief.id)
    db_session.add(draft)
    db_session.commit()

    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}
    response = client.post(f"/briefs/{draft.id}/generate", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "adapted"
    assert body["mode"] == "demo"
    assert body["google_plan"]["campaign_name"]

    get_settings.cache_clear()
    main.app.dependency_overrides.clear()
