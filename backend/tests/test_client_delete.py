from sqlalchemy import select

from app.config import get_settings
from app.models.agency import Agency
from app.models.approval import Approval
from app.models.audit import AuditLog
from app.models.brand_voice import BrandVoiceProfile
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.client_asset import ClientAsset
from app.models.guardrail import GuardrailReport
from app.models.launch import LaunchRecord
from tests.conftest import make_supabase_jwt

_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 100


def _agency_headers(db_session, supabase_user_id: str, email: str):
    agency = Agency(supabase_user_id=supabase_user_id, name="Acme", email=email)
    db_session.add(agency)
    db_session.commit()
    return agency, {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}


def _full_client_dataset(db_session, agency, name="Client A"):
    """A client with brand voice, an asset, and a full brief -> draft -> guardrail /
    approval / launch chain, so deletion can be proven to reach every table."""
    client_row = Client(agency_id=agency.id, name=name)
    db_session.add(client_row)
    db_session.flush()

    db_session.add(
        BrandVoiceProfile(client_id=client_row.id, tone="friendly", banned_terms=[], required_disclaimers=[], approved_offers=[])
    )
    db_session.add(ClientAsset(client_id=client_row.id, kind="logo", filename="logo.png", stored_path=f"{client_row.id}/logo.png"))

    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()

    draft = CampaignDraft(brief_id=brief.id, status="failed")
    db_session.add(draft)
    db_session.flush()

    db_session.add(GuardrailReport(campaign_draft_id=draft.id, flags_json=[], has_blocking_flags=False))
    db_session.add(Approval(campaign_draft_id=draft.id, decision="approved"))
    db_session.add(LaunchRecord(campaign_draft_id=draft.id, platform="google", status="failed", error_message="boom"))
    db_session.add(AuditLog(agency_id=agency.id, client_id=client_row.id, event_type="draft.launched", payload={}))
    db_session.commit()

    return client_row, brief, draft


def test_delete_client_removes_the_full_dataset(client, db_session, monkeypatch, tmp_path):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(get_settings(), "uploads_dir", str(tmp_path))
    agency, headers = _agency_headers(db_session, "sb-delete-1", "delete1@acme.test")
    client_row, brief, draft = _full_client_dataset(db_session, agency)
    # Capture plain ids up front — after the delete this session's identity map is
    # stale for these rows (bulk .delete(synchronize_session=False) doesn't update
    # it), and touching an attribute on a now-detached/expired ORM object later
    # raises DetachedInstanceError/ObjectDeletedError instead of just being gone.
    client_id, brief_id, draft_id = client_row.id, brief.id, draft.id
    stored_dir = tmp_path / str(client_id)
    stored_dir.mkdir(parents=True)
    (stored_dir / "logo.png").write_bytes(_PNG_BYTES)

    response = client.delete(f"/clients/{client_id}", headers=headers)

    assert response.status_code == 200
    assert response.json()["status"] == "deleted"

    db_session.expunge_all()

    assert client.get(f"/clients/{client_id}", headers=headers).status_code == 404
    assert db_session.scalars(select(Client).where(Client.id == client_id)).first() is None
    assert db_session.scalars(select(Brief).where(Brief.id == brief_id)).first() is None
    assert db_session.scalars(select(CampaignDraft).where(CampaignDraft.id == draft_id)).first() is None
    assert db_session.query(GuardrailReport).filter_by(campaign_draft_id=draft_id).count() == 0
    assert db_session.query(Approval).filter_by(campaign_draft_id=draft_id).count() == 0
    assert db_session.query(LaunchRecord).filter_by(campaign_draft_id=draft_id).count() == 0
    assert db_session.query(BrandVoiceProfile).filter_by(client_id=client_id).count() == 0
    assert db_session.query(ClientAsset).filter_by(client_id=client_id).count() == 0
    assert db_session.query(AuditLog).filter_by(client_id=client_id).count() == 0
    assert not (stored_dir / "logo.png").exists()

    main.app.dependency_overrides.clear()


def test_delete_client_leaves_other_clients_untouched(client, db_session, monkeypatch, tmp_path):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(get_settings(), "uploads_dir", str(tmp_path))
    agency, headers = _agency_headers(db_session, "sb-delete-2", "delete2@acme.test")
    doomed, _, _ = _full_client_dataset(db_session, agency, name="Doomed")
    survivor, survivor_brief, survivor_draft = _full_client_dataset(db_session, agency, name="Survivor")

    response = client.delete(f"/clients/{doomed.id}", headers=headers)

    assert response.status_code == 200
    assert client.get(f"/clients/{survivor.id}", headers=headers).status_code == 200
    assert db_session.get(Brief, survivor_brief.id) is not None
    assert db_session.get(CampaignDraft, survivor_draft.id) is not None

    main.app.dependency_overrides.clear()


def test_delete_client_404_for_unowned_client(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    owner, owner_headers = _agency_headers(db_session, "sb-delete-3", "delete3@acme.test")
    _, other_headers = _agency_headers(db_session, "sb-delete-4", "delete4@acme.test")
    client_row = Client(agency_id=owner.id, name="Client A")
    db_session.add(client_row)
    db_session.commit()

    response = client.delete(f"/clients/{client_row.id}", headers=other_headers)

    assert response.status_code == 404

    main.app.dependency_overrides.clear()


def test_delete_client_409_when_launched_campaigns_exist(client, db_session, monkeypatch, tmp_path):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(get_settings(), "uploads_dir", str(tmp_path))
    agency, headers = _agency_headers(db_session, "sb-delete-5", "delete5@acme.test")
    client_row, _brief, draft = _full_client_dataset(db_session, agency)
    draft.status = "launched"
    db_session.add(
        LaunchRecord(
            campaign_draft_id=draft.id,
            platform="meta",
            status="success",
            external_campaign_id="987654321",
        )
    )
    db_session.commit()
    client_id, draft_id = client_row.id, draft.id

    response = client.delete(f"/clients/{client_id}", headers=headers)

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert "launched" in detail["message"].lower()
    assert detail["launched_campaigns"] == [
        {
            "draft_id": str(draft_id),
            "launches": [{"platform": "meta", "external_campaign_id": "987654321"}],
        }
    ]
    assert db_session.get(Client, client_id) is not None

    main.app.dependency_overrides.clear()


def test_delete_client_force_overrides_launched_guard(client, db_session, monkeypatch, tmp_path):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(get_settings(), "uploads_dir", str(tmp_path))
    agency, headers = _agency_headers(db_session, "sb-delete-6", "delete6@acme.test")
    client_row, _brief, draft = _full_client_dataset(db_session, agency)
    draft.status = "launched"
    db_session.commit()
    client_id = client_row.id

    response = client.delete(f"/clients/{client_id}?force=true", headers=headers)

    assert response.status_code == 200
    assert response.json()["status"] == "deleted"
    db_session.expunge_all()
    assert db_session.scalars(select(Client).where(Client.id == client_id)).first() is None

    main.app.dependency_overrides.clear()


def test_delete_client_allows_when_launched_campaigns_are_archived(client, db_session, monkeypatch, tmp_path):
    from datetime import datetime, timezone

    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    monkeypatch.setattr(get_settings(), "uploads_dir", str(tmp_path))
    agency, headers = _agency_headers(db_session, "sb-delete-7", "delete7@acme.test")
    client_row, _brief, draft = _full_client_dataset(db_session, agency)
    draft.status = "launched"
    draft.archived_at = datetime.now(timezone.utc)
    db_session.commit()
    client_id = client_row.id

    response = client.delete(f"/clients/{client_id}", headers=headers)

    assert response.status_code == 200
    assert response.json()["status"] == "deleted"

    main.app.dependency_overrides.clear()
