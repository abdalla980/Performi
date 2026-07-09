from app.models.agency import Agency
from app.services.audit import record_audit_event
from tests.conftest import make_supabase_jwt


def _agency_headers(db_session, supabase_user_id: str, email: str):
    agency = Agency(supabase_user_id=supabase_user_id, name="Acme", email=email)
    db_session.add(agency)
    db_session.commit()
    return agency, {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}


def test_list_audit_log_returns_entries_newest_first(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    agency, headers = _agency_headers(db_session, "sb-audit-1", "audit1@acme.test")

    record_audit_event(db_session, agency_id=agency.id, event_type="brief.submitted", payload={"n": 1})
    record_audit_event(db_session, agency_id=agency.id, event_type="draft.generated", payload={"n": 2})

    response = client.get("/audit-log", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["event_type"] == "draft.generated"
    assert body[1]["event_type"] == "brief.submitted"

    main.app.dependency_overrides.clear()


def test_list_audit_log_excludes_other_agency(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    agency, headers = _agency_headers(db_session, "sb-audit-2", "audit2@acme.test")
    other_agency, other_headers = _agency_headers(db_session, "sb-audit-3", "audit3@acme.test")

    record_audit_event(db_session, agency_id=agency.id, event_type="brief.submitted", payload={})
    record_audit_event(db_session, agency_id=other_agency.id, event_type="brief.submitted", payload={})

    response = client.get("/audit-log", headers=other_headers)

    assert response.status_code == 200
    assert len(response.json()) == 1

    main.app.dependency_overrides.clear()
