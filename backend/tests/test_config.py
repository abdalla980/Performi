from app.config import get_settings
from app.models.agency import Agency
from tests.conftest import make_supabase_jwt


def _headers(db_session):
    agency = Agency(supabase_user_id="sb-config-1", name="Acme", email="config1@acme.test")
    db_session.add(agency)
    db_session.commit()
    return {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}


def test_config_status_reports_unconfigured_platforms(client, db_session, monkeypatch):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    monkeypatch.setenv("GOOGLE_ADS_CLIENT_ID", "")
    monkeypatch.setenv("META_APP_ID", "")
    get_settings.cache_clear()

    response = client.get("/config/status", headers=_headers(db_session))

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "anthropic_configured": False,
        "google_ads_configured": False,
        "meta_configured": False,
    }

    get_settings.cache_clear()
    main.app.dependency_overrides.clear()


def test_config_status_reports_configured_anthropic(client, db_session, monkeypatch):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-key")
    get_settings.cache_clear()

    response = client.get("/config/status", headers=_headers(db_session))

    assert response.json()["anthropic_configured"] is True

    get_settings.cache_clear()
    main.app.dependency_overrides.clear()
