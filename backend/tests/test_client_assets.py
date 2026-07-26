from pathlib import Path

from app.config import get_settings
from app.models.agency import Agency
from tests.conftest import make_supabase_jwt

_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 100


def _agency_headers(db_session, supabase_user_id: str, email: str):
    agency = Agency(supabase_user_id=supabase_user_id, name="Acme", email=email)
    db_session.add(agency)
    db_session.commit()
    return agency, {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}


def _client_id(client, headers, name="Client A"):
    return client.post("/clients", json={"name": name}, headers=headers).json()["id"]


def test_upload_logo_asset_succeeds(client, db_session, monkeypatch, tmp_path):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(get_settings(), "uploads_dir", str(tmp_path))
    _, headers = _agency_headers(db_session, "sb-assets-1", "assets1@acme.test")
    client_id = _client_id(client, headers)

    response = client.post(
        f"/clients/{client_id}/assets",
        headers=headers,
        data={"kind": "logo"},
        files={"file": ("logo.png", _PNG_BYTES, "image/png")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "logo"
    assert body["filename"] == "logo.png"
    assert body["url"].startswith(f"/uploads/{client_id}/")
    assert (tmp_path / client_id).exists()

    main.app.dependency_overrides.clear()


def test_upload_rejects_non_image_content_type(client, db_session, monkeypatch, tmp_path):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(get_settings(), "uploads_dir", str(tmp_path))
    _, headers = _agency_headers(db_session, "sb-assets-2", "assets2@acme.test")
    client_id = _client_id(client, headers)

    response = client.post(
        f"/clients/{client_id}/assets",
        headers=headers,
        data={"kind": "image"},
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 422

    main.app.dependency_overrides.clear()


def test_upload_rejects_oversized_file(client, db_session, monkeypatch, tmp_path):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(get_settings(), "uploads_dir", str(tmp_path))
    _, headers = _agency_headers(db_session, "sb-assets-3", "assets3@acme.test")
    client_id = _client_id(client, headers)

    oversized = b"0" * (5 * 1024 * 1024 + 1)
    response = client.post(
        f"/clients/{client_id}/assets",
        headers=headers,
        data={"kind": "image"},
        files={"file": ("big.png", oversized, "image/png")},
    )

    assert response.status_code == 422

    main.app.dependency_overrides.clear()


def test_upload_rejects_invalid_kind(client, db_session, monkeypatch, tmp_path):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(get_settings(), "uploads_dir", str(tmp_path))
    _, headers = _agency_headers(db_session, "sb-assets-4", "assets4@acme.test")
    client_id = _client_id(client, headers)

    response = client.post(
        f"/clients/{client_id}/assets",
        headers=headers,
        data={"kind": "banner"},
        files={"file": ("logo.png", _PNG_BYTES, "image/png")},
    )

    assert response.status_code == 422

    main.app.dependency_overrides.clear()


def test_upload_404_for_unowned_client(client, db_session, monkeypatch, tmp_path):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(get_settings(), "uploads_dir", str(tmp_path))
    _, owner_headers = _agency_headers(db_session, "sb-assets-5", "assets5@acme.test")
    _, other_headers = _agency_headers(db_session, "sb-assets-6", "assets6@acme.test")
    client_id = _client_id(client, owner_headers)

    response = client.post(
        f"/clients/{client_id}/assets",
        headers=other_headers,
        data={"kind": "logo"},
        files={"file": ("logo.png", _PNG_BYTES, "image/png")},
    )

    assert response.status_code == 404

    main.app.dependency_overrides.clear()


def test_get_client_detail_includes_uploaded_assets(client, db_session, monkeypatch, tmp_path):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(get_settings(), "uploads_dir", str(tmp_path))
    _, headers = _agency_headers(db_session, "sb-assets-7", "assets7@acme.test")
    client_id = _client_id(client, headers)
    client.post(
        f"/clients/{client_id}/assets",
        headers=headers,
        data={"kind": "logo"},
        files={"file": ("logo.png", _PNG_BYTES, "image/png")},
    )

    response = client.get(f"/clients/{client_id}", headers=headers)

    assert response.status_code == 200
    assert len(response.json()["assets"]) == 1
    assert response.json()["assets"][0]["kind"] == "logo"

    main.app.dependency_overrides.clear()


def test_delete_asset_removes_it_from_disk_and_db(client, db_session, monkeypatch, tmp_path):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(get_settings(), "uploads_dir", str(tmp_path))
    _, headers = _agency_headers(db_session, "sb-assets-8", "assets8@acme.test")
    client_id = _client_id(client, headers)
    upload = client.post(
        f"/clients/{client_id}/assets",
        headers=headers,
        data={"kind": "image"},
        files={"file": ("photo.png", _PNG_BYTES, "image/png")},
    ).json()
    stored_file = tmp_path / client_id / Path(upload["url"]).name
    assert stored_file.exists()

    response = client.delete(f"/clients/{client_id}/assets/{upload['id']}", headers=headers)

    assert response.status_code == 200
    assert not stored_file.exists()
    assert client.get(f"/clients/{client_id}", headers=headers).json()["assets"] == []

    main.app.dependency_overrides.clear()


def test_delete_404_for_unowned_client(client, db_session, monkeypatch, tmp_path):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(get_settings(), "uploads_dir", str(tmp_path))
    _, owner_headers = _agency_headers(db_session, "sb-assets-9", "assets9@acme.test")
    _, other_headers = _agency_headers(db_session, "sb-assets-10", "assets10@acme.test")
    client_id = _client_id(client, owner_headers)
    upload = client.post(
        f"/clients/{client_id}/assets",
        headers=owner_headers,
        data={"kind": "image"},
        files={"file": ("photo.png", _PNG_BYTES, "image/png")},
    ).json()

    response = client.delete(f"/clients/{client_id}/assets/{upload['id']}", headers=other_headers)

    assert response.status_code == 404

    main.app.dependency_overrides.clear()


def test_logo_url_surfaces_on_client_list_and_draft_summary(client, db_session, monkeypatch, tmp_path):
    """The client's uploaded logo should show up as an avatar wherever that client is
    listed — both the plain client list and campaign draft summaries — not just the
    client's own detail page."""
    import uuid

    from app import main
    from app.models.brief import Brief, CampaignDraft

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(get_settings(), "uploads_dir", str(tmp_path))
    _, headers = _agency_headers(db_session, "sb-assets-11", "assets11@acme.test")
    client_id = _client_id(client, headers)

    assert client.get("/clients", headers=headers).json()[0]["logo_url"] is None

    upload = client.post(
        f"/clients/{client_id}/assets",
        headers=headers,
        data={"kind": "logo"},
        files={"file": ("logo.png", _PNG_BYTES, "image/png")},
    ).json()

    list_body = client.get("/clients", headers=headers).json()
    assert list_body[0]["logo_url"] == upload["url"]

    brief = Brief(client_id=uuid.UUID(client_id), business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    db_session.add(CampaignDraft(brief_id=brief.id, status="pending_generation"))
    db_session.commit()

    briefs_body = client.get("/briefs", headers=headers).json()
    assert briefs_body[0]["client_logo_url"] == upload["url"]

    main.app.dependency_overrides.clear()
