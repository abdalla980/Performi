from app.models.agency import Agency
from tests.conftest import make_supabase_jwt


def _agency_headers(db_session, supabase_user_id: str, email: str):
    agency = Agency(supabase_user_id=supabase_user_id, name="Acme", email=email)
    db_session.add(agency)
    db_session.commit()
    return agency, {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}


def test_google_oauth_start_returns_authorize_url(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-oauth-1", "oauth1@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]

    response = client.get(f"/clients/{client_id}/google/oauth/start", headers=headers)

    assert response.status_code == 200
    authorize_url = response.json()["authorize_url"]
    assert f"state={client_id}" in authorize_url
    assert "accounts.google.com" in authorize_url

    main.app.dependency_overrides.clear()


def test_google_oauth_start_rejects_unowned_client(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, owner_headers = _agency_headers(db_session, "sb-oauth-2", "oauth2@acme.test")
    _, other_headers = _agency_headers(db_session, "sb-oauth-3", "oauth3@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=owner_headers).json()["id"]

    response = client.get(f"/clients/{client_id}/google/oauth/start", headers=other_headers)

    assert response.status_code == 404

    main.app.dependency_overrides.clear()


def test_google_oauth_callback_stores_token_and_redirects_with_no_auth_header(client, db_session, monkeypatch):
    """The callback is hit by a raw browser redirect from Google, never carrying our
    Authorization header — it must authorize purely from the state param, not
    get_current_agency. This mirrors why google_oauth_start can't itself be a redirect:
    a plain browser navigation to it wouldn't carry the header either."""
    from app import main
    from app.routers import clients as clients_router
    from app.services.google_oauth import GoogleTokenResponse

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-oauth-4", "oauth4@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]

    monkeypatch.setattr(
        clients_router,
        "exchange_code_for_tokens",
        lambda code, http_client: GoogleTokenResponse(refresh_token="real-refresh-token", access_token="at-1"),
    )

    response = client.get(
        f"/clients/google/oauth/callback?code=auth-code&state={client_id}",
        follow_redirects=False,
    )

    assert response.status_code in (302, 307)
    assert response.headers["location"] == f"http://localhost:5173/clients/{client_id}?connected=google"

    detail = client.get(f"/clients/{client_id}", headers=headers).json()
    assert detail["google_connected"] is True

    main.app.dependency_overrides.clear()


def test_google_oauth_callback_404_for_unknown_client(client, db_session):
    from app import main
    import uuid

    main.app.dependency_overrides[main.get_db] = lambda: db_session

    response = client.get(
        f"/clients/google/oauth/callback?code=auth-code&state={uuid.uuid4()}",
        follow_redirects=False,
    )

    assert response.status_code == 404

    main.app.dependency_overrides.clear()


def test_meta_oauth_start_returns_authorize_url(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-oauth-5", "oauth5@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]

    response = client.get(f"/clients/{client_id}/meta/oauth/start", headers=headers)

    assert response.status_code == 200
    authorize_url = response.json()["authorize_url"]
    assert f"state={client_id}" in authorize_url
    assert "facebook.com" in authorize_url

    main.app.dependency_overrides.clear()


def test_meta_oauth_callback_stores_token_and_redirects_with_no_auth_header(client, db_session, monkeypatch):
    from app import main
    from app.routers import clients as clients_router
    from app.services.meta_oauth import MetaTokenResponse

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-oauth-6", "oauth6@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]

    monkeypatch.setattr(
        clients_router.meta_oauth,
        "exchange_code_for_tokens",
        lambda code, http_client: MetaTokenResponse(access_token="real-meta-token"),
    )

    response = client.get(
        f"/clients/meta/oauth/callback?code=auth-code&state={client_id}",
        follow_redirects=False,
    )

    assert response.status_code in (302, 307)
    assert response.headers["location"] == f"http://localhost:5173/clients/{client_id}?connected=meta"

    detail = client.get(f"/clients/{client_id}", headers=headers).json()
    assert detail["meta_connected"] is True

    main.app.dependency_overrides.clear()


def test_set_google_ad_account_requires_prior_connect(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-oauth-7", "oauth7@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]

    response = client.put(
        f"/clients/{client_id}/google/ad-account", json={"customer_id": "123-456-7890"}, headers=headers
    )

    assert response.status_code == 409

    main.app.dependency_overrides.clear()


def test_set_google_ad_account_after_connect(client, db_session, monkeypatch):
    from app import main
    from app.routers import clients as clients_router
    from app.services.google_oauth import GoogleTokenResponse

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-oauth-8", "oauth8@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]
    monkeypatch.setattr(
        clients_router,
        "exchange_code_for_tokens",
        lambda code, http_client: GoogleTokenResponse(refresh_token="real-refresh-token", access_token="at-1"),
    )
    client.get(f"/clients/google/oauth/callback?code=auth-code&state={client_id}", follow_redirects=False)

    response = client.put(
        f"/clients/{client_id}/google/ad-account", json={"customer_id": "123-456-7890"}, headers=headers
    )

    assert response.status_code == 200
    assert response.json()["google_ads_customer_id"] == "123-456-7890"

    main.app.dependency_overrides.clear()


def test_set_google_ad_account_rejects_unowned_client(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, owner_headers = _agency_headers(db_session, "sb-oauth-9", "oauth9@acme.test")
    _, other_headers = _agency_headers(db_session, "sb-oauth-10", "oauth10@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=owner_headers).json()["id"]

    response = client.put(
        f"/clients/{client_id}/google/ad-account", json={"customer_id": "123-456-7890"}, headers=other_headers
    )

    assert response.status_code == 404

    main.app.dependency_overrides.clear()


def test_set_meta_ad_account_requires_prior_connect(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-oauth-11", "oauth11@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]

    response = client.put(f"/clients/{client_id}/meta/ad-account", json={"ad_account_id": "act_123"}, headers=headers)

    assert response.status_code == 409

    main.app.dependency_overrides.clear()


def test_set_meta_ad_account_after_connect(client, db_session, monkeypatch):
    from app import main
    from app.routers import clients as clients_router
    from app.services.meta_oauth import MetaTokenResponse

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-oauth-12", "oauth12@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]
    monkeypatch.setattr(
        clients_router.meta_oauth,
        "exchange_code_for_tokens",
        lambda code, http_client: MetaTokenResponse(access_token="real-meta-token"),
    )
    client.get(f"/clients/meta/oauth/callback?code=auth-code&state={client_id}", follow_redirects=False)

    response = client.put(f"/clients/{client_id}/meta/ad-account", json={"ad_account_id": "act_123"}, headers=headers)

    assert response.status_code == 200
    assert response.json()["meta_ad_account_id"] == "act_123"

    main.app.dependency_overrides.clear()
