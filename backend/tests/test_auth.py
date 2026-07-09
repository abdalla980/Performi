from app.models.agency import Agency
from tests.conftest import make_supabase_jwt


def test_me_returns_agency_for_valid_supabase_token(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session

    agency = Agency(supabase_user_id="sb-user-42", name="Acme Agency", email="owner@acme.test")
    db_session.add(agency)
    db_session.commit()

    token = make_supabase_jwt("sb-user-42")
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["email"] == "owner@acme.test"

    main.app.dependency_overrides.clear()


def test_me_rejects_token_with_no_linked_agency(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session

    token = make_supabase_jwt("sb-user-unlinked")
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401

    main.app.dependency_overrides.clear()


def test_me_rejects_invalid_token(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session

    response = client.get("/me", headers={"Authorization": "Bearer not-a-real-token"})

    assert response.status_code == 401

    main.app.dependency_overrides.clear()
