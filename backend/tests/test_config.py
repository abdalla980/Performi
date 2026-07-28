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


def test_config_status_requires_agency_google_connect(client, db_session, monkeypatch):
    from app import main
    from app.encryption import encrypt_token

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setenv("GOOGLE_ADS_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_ADS_CLIENT_SECRET", "secret")
    monkeypatch.setenv("GOOGLE_ADS_DEVELOPER_TOKEN", "devtok")
    get_settings.cache_clear()

    agency = Agency(supabase_user_id="sb-config-2", name="Acme", email="config2@acme.test")
    db_session.add(agency)
    db_session.commit()
    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}

    # App credentials alone are not enough after the agency-manager change.
    assert client.get("/config/status", headers=headers).json()["google_ads_configured"] is False

    agency.google_ads_refresh_token_encrypted = encrypt_token("rt")
    agency.google_ads_login_customer_id = "4574433227"
    db_session.commit()

    assert client.get("/config/status", headers=headers).json()["google_ads_configured"] is True

    get_settings.cache_clear()
    main.app.dependency_overrides.clear()
