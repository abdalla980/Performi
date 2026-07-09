from app.models.agency import Agency
from tests.conftest import make_supabase_jwt


def test_create_client_for_authenticated_agency(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session

    agency = Agency(supabase_user_id="sb-clients-1", name="Acme", email="clients@acme.test")
    db_session.add(agency)
    db_session.commit()
    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}

    response = client.post("/clients", json={"name": "Client A"}, headers=headers)

    assert response.status_code == 200
    assert response.json()["name"] == "Client A"
    assert response.json()["google_ads_customer_id"] is None

    main.app.dependency_overrides.clear()


def test_set_brand_voice_for_client(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session

    agency = Agency(supabase_user_id="sb-clients-2", name="Acme", email="clients2@acme.test")
    db_session.add(agency)
    db_session.commit()
    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}

    create_response = client.post("/clients", json={"name": "Client B"}, headers=headers)
    client_id = create_response.json()["id"]

    response = client.put(
        f"/clients/{client_id}/brand-voice",
        json={
            "tone": "friendly, expert",
            "banned_terms": ["cheap"],
            "required_disclaimers": ["Results vary."],
            "approved_offers": ["10% off first order"],
        },
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["tone"] == "friendly, expert"
    assert body["banned_terms"] == ["cheap"]

    main.app.dependency_overrides.clear()


def _agency_headers(db_session, supabase_user_id: str, email: str):
    from app.models.agency import Agency

    agency = Agency(supabase_user_id=supabase_user_id, name="Acme", email=email)
    db_session.add(agency)
    db_session.commit()
    return agency, {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}


def test_list_clients_returns_only_this_agencys_clients(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-clients-3", "clients3@acme.test")
    _, other_headers = _agency_headers(db_session, "sb-clients-4", "clients4@acme.test")

    client.post("/clients", json={"name": "Mine"}, headers=headers)
    client.post("/clients", json={"name": "Theirs"}, headers=other_headers)

    response = client.get("/clients", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "Mine"
    assert body[0]["google_connected"] is False
    assert body[0]["meta_connected"] is False

    main.app.dependency_overrides.clear()


def test_get_client_detail_includes_brand_voice(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-clients-5", "clients5@acme.test")

    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]
    client.put(
        f"/clients/{client_id}/brand-voice",
        json={"tone": "warm", "banned_terms": [], "required_disclaimers": [], "approved_offers": []},
        headers=headers,
    )

    response = client.get(f"/clients/{client_id}", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Client A"
    assert body["brand_voice"]["tone"] == "warm"

    main.app.dependency_overrides.clear()


def test_get_client_detail_with_no_brand_voice_returns_null(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-clients-6", "clients6@acme.test")

    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]

    response = client.get(f"/clients/{client_id}", headers=headers)

    assert response.status_code == 200
    assert response.json()["brand_voice"] is None

    main.app.dependency_overrides.clear()


def test_google_demo_connect_marks_client_connected(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-clients-7", "clients7@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]

    response = client.post(f"/clients/{client_id}/google/demo-connect", headers=headers)

    assert response.status_code == 200
    assert response.json()["status"] == "connected"

    detail = client.get(f"/clients/{client_id}", headers=headers).json()
    assert detail["google_connected"] is True

    main.app.dependency_overrides.clear()


def test_meta_demo_connect_marks_client_connected(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_headers(db_session, "sb-clients-8", "clients8@acme.test")
    client_id = client.post("/clients", json={"name": "Client A"}, headers=headers).json()["id"]

    response = client.post(f"/clients/{client_id}/meta/demo-connect", headers=headers)

    assert response.status_code == 200
    detail = client.get(f"/clients/{client_id}", headers=headers).json()
    assert detail["meta_connected"] is True

    main.app.dependency_overrides.clear()
