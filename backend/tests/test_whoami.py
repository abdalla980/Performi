from app.models.agency import Agency
from app.models.client import Client
from tests.conftest import make_supabase_jwt


def test_whoami_returns_agency_role_for_agency_token(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session

    agency = Agency(supabase_user_id="sb-agency-1", name="Acme Agency", email="owner@acme.test")
    db_session.add(agency)
    db_session.commit()

    token = make_supabase_jwt("sb-agency-1")
    response = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "agency"
    assert body["name"] == "Acme Agency"
    assert body["agency_name"] is None

    main.app.dependency_overrides.clear()


def test_whoami_returns_client_role_for_client_token(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session

    agency = Agency(supabase_user_id="sb-agency-2", name="Acme Agency", email="owner2@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Acme Bakery", supabase_user_id="sb-client-1")
    db_session.add(client_row)
    db_session.commit()

    token = make_supabase_jwt("sb-client-1")
    response = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "client"
    assert body["name"] == "Acme Bakery"
    assert body["agency_name"] == "Acme Agency"

    main.app.dependency_overrides.clear()


def test_whoami_rejects_unlinked_token(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session

    token = make_supabase_jwt("sb-nobody")
    response = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401

    main.app.dependency_overrides.clear()
