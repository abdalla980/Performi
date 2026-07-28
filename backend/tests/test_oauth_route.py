import uuid

from app.models.agency import Agency
from app.services.google_oauth import GoogleTokenResponse
from app.services.meta_oauth import MetaTokenResponse
from tests.conftest import make_supabase_jwt


def _agency_headers(db_session, supabase_user_id: str, email: str):
    agency = Agency(supabase_user_id=supabase_user_id, name="Acme", email=email)
    db_session.add(agency)
    db_session.commit()
    return agency, {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}


def test_agency_google_oauth_start_returns_authorize_url(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    agency, headers = _agency_headers(db_session, "sb-oauth-1", "oauth1@acme.test")

    response = client.get("/agency/google/oauth/start", headers=headers)

    assert response.status_code == 200
    authorize_url = response.json()["authorize_url"]
    assert f"state={agency.id}" in authorize_url
    assert "accounts.google.com" in authorize_url

    main.app.dependency_overrides.clear()


def test_agency_google_oauth_callback_stores_token_and_redirects(client, db_session, monkeypatch):
    from app import main
    from app.routers import agency_connect as agency_router

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    agency, headers = _agency_headers(db_session, "sb-oauth-4", "oauth4@acme.test")

    monkeypatch.setattr(
        agency_router,
        "exchange_code_for_tokens",
        lambda code, http_client: GoogleTokenResponse(refresh_token="real-refresh-token", access_token="at-1"),
    )

    response = client.get(
        f"/agency/google/oauth/callback?code=auth-code&state={agency.id}",
        follow_redirects=False,
    )

    assert response.status_code in (302, 307)
    assert response.headers["location"] == "http://localhost:5173/settings?connected=google"

    db_session.refresh(agency)
    assert agency.google_ads_refresh_token_encrypted is not None

    main.app.dependency_overrides.clear()


def test_agency_google_oauth_callback_404_for_unknown_agency(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session

    response = client.get(
        f"/agency/google/oauth/callback?code=auth-code&state={uuid.uuid4()}",
        follow_redirects=False,
    )

    assert response.status_code == 404

    main.app.dependency_overrides.clear()


def test_agency_meta_oauth_start_returns_authorize_url(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    agency, headers = _agency_headers(db_session, "sb-oauth-5", "oauth5@acme.test")

    response = client.get("/agency/meta/oauth/start", headers=headers)

    assert response.status_code == 200
    authorize_url = response.json()["authorize_url"]
    assert f"state={agency.id}" in authorize_url
    assert "facebook.com" in authorize_url

    main.app.dependency_overrides.clear()


def test_agency_meta_oauth_callback_stores_token_and_redirects(client, db_session, monkeypatch):
    from app import main
    from app.routers import agency_connect as agency_router

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    agency, headers = _agency_headers(db_session, "sb-oauth-6", "oauth6@acme.test")

    monkeypatch.setattr(
        agency_router.meta_oauth,
        "exchange_code_for_tokens",
        lambda code, http_client: MetaTokenResponse(access_token="real-meta-token"),
    )

    response = client.get(
        f"/agency/meta/oauth/callback?code=auth-code&state={agency.id}",
        follow_redirects=False,
    )

    assert response.status_code in (302, 307)
    assert response.headers["location"] == "http://localhost:5173/settings?connected=meta"
    db_session.refresh(agency)
    assert agency.meta_access_token_encrypted is not None

    main.app.dependency_overrides.clear()


def test_set_google_manager_account_requires_prior_oauth(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-oauth-mcc-1", "mcc1@acme.test")

    response = client.put(
        "/agency/google/manager-account",
        json={"login_customer_id": "4574433227"},
        headers=headers,
    )

    assert response.status_code == 409

    main.app.dependency_overrides.clear()


def test_set_google_manager_account_after_oauth(client, db_session, monkeypatch):
    from app import main
    from app.routers import agency_connect as agency_router

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    agency, headers = _agency_headers(db_session, "sb-oauth-mcc-2", "mcc2@acme.test")
    monkeypatch.setattr(
        agency_router,
        "exchange_code_for_tokens",
        lambda code, http_client: GoogleTokenResponse(refresh_token="rt", access_token="at"),
    )
    client.get(f"/agency/google/oauth/callback?code=auth-code&state={agency.id}", follow_redirects=False)

    response = client.put(
        "/agency/google/manager-account",
        json={"login_customer_id": "4574433227"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["login_customer_id"] == "4574433227"
    db_session.refresh(agency)
    assert agency.google_ads_login_customer_id == "4574433227"

    main.app.dependency_overrides.clear()


def test_set_google_ad_account_requires_agency_connect(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-oauth-7", "oauth7@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]

    response = client.put(
        f"/clients/{client_id}/google/ad-account", json={"customer_id": "123-456-7890"}, headers=headers
    )

    assert response.status_code == 409
    assert "Settings" in response.json()["detail"]

    main.app.dependency_overrides.clear()


def test_set_google_ad_account_after_agency_connect(client, db_session, monkeypatch):
    from app import main
    from app.routers import agency_connect as agency_router

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    agency, headers = _agency_headers(db_session, "sb-oauth-8", "oauth8@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]
    monkeypatch.setattr(
        agency_router,
        "exchange_code_for_tokens",
        lambda code, http_client: GoogleTokenResponse(refresh_token="real-refresh-token", access_token="at-1"),
    )
    client.get(f"/agency/google/oauth/callback?code=auth-code&state={agency.id}", follow_redirects=False)

    response = client.put(
        f"/clients/{client_id}/google/ad-account", json={"customer_id": "123-456-7890"}, headers=headers
    )

    assert response.status_code == 200
    body = response.json()
    assert body["google_ads_customer_id"] == "123-456-7890"
    assert body["google_connected"] is True

    main.app.dependency_overrides.clear()


def test_set_meta_ad_account_requires_agency_connect(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-oauth-11", "oauth11@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]

    response = client.put(f"/clients/{client_id}/meta/ad-account", json={"ad_account_id": "act_123"}, headers=headers)

    assert response.status_code == 409

    main.app.dependency_overrides.clear()


def test_set_meta_ad_account_after_agency_connect(client, db_session, monkeypatch):
    from app import main
    from app.routers import agency_connect as agency_router

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    agency, headers = _agency_headers(db_session, "sb-oauth-12", "oauth12@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]
    monkeypatch.setattr(
        agency_router.meta_oauth,
        "exchange_code_for_tokens",
        lambda code, http_client: MetaTokenResponse(access_token="real-meta-token"),
    )
    client.get(f"/agency/meta/oauth/callback?code=auth-code&state={agency.id}", follow_redirects=False)

    response = client.put(f"/clients/{client_id}/meta/ad-account", json={"ad_account_id": "act_123"}, headers=headers)

    assert response.status_code == 200
    assert response.json()["meta_ad_account_id"] == "act_123"
    assert response.json()["meta_connected"] is True

    main.app.dependency_overrides.clear()


def test_google_demo_connect_stamps_agency_tokens_and_client_id(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    agency, headers = _agency_headers(db_session, "sb-oauth-demo", "demodemo@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]

    response = client.post(f"/clients/{client_id}/google/demo-connect", headers=headers)

    assert response.status_code == 200
    db_session.refresh(agency)
    assert agency.google_ads_refresh_token_encrypted is not None
    assert agency.google_ads_login_customer_id == "demo-mcc"
    detail = client.get(f"/clients/{client_id}", headers=headers).json()
    assert detail["google_connected"] is True
    assert detail["google_ads_customer_id"].startswith("demo-")

    main.app.dependency_overrides.clear()
