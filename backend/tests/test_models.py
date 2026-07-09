import uuid

from app.models.agency import Agency
from app.models.audit import AuditLog
from app.models.brand_voice import BrandVoiceProfile
from app.models.client import Client
from app.models.brief import Brief, CampaignDraft
from app.services.audit import record_audit_event


def test_create_agency_client_brief_and_draft(db_session):
    agency = Agency(supabase_user_id="sb-user-1", name="Acme Agency", email="owner@acme.test")
    db_session.add(agency)
    db_session.flush()

    client = Client(agency_id=agency.id, name="Client A")
    db_session.add(client)
    db_session.flush()

    brief = Brief(
        client_id=client.id,
        business_description="Local bakery in Austin",
        budget_usd=500,
        goals="Drive foot traffic",
    )
    db_session.add(brief)
    db_session.flush()

    draft = CampaignDraft(brief_id=brief.id)
    db_session.add(draft)
    db_session.commit()

    fetched = db_session.get(Brief, brief.id)
    assert fetched.client_id == client.id
    assert fetched.client.agency_id == agency.id
    assert fetched.draft.status == "pending_generation"
    assert isinstance(fetched.draft.id, uuid.UUID)


def test_create_brand_voice_profile_for_client(db_session):
    agency = Agency(supabase_user_id="sb-user-2", name="Acme Agency", email="owner2@acme.test")
    db_session.add(agency)
    db_session.flush()

    client = Client(agency_id=agency.id, name="Client B")
    db_session.add(client)
    db_session.flush()

    profile = BrandVoiceProfile(
        client_id=client.id,
        tone="friendly, expert",
        banned_terms=["cheap", "guaranteed"],
        required_disclaimers=["Results vary."],
        approved_offers=["10% off first order"],
    )
    db_session.add(profile)
    db_session.commit()

    fetched = db_session.get(Client, client.id)
    assert fetched.brand_voice_profile.tone == "friendly, expert"
    assert "cheap" in fetched.brand_voice_profile.banned_terms


def test_record_audit_event_persists(db_session):
    agency = Agency(supabase_user_id="sb-user-3", name="Acme Agency", email="owner3@acme.test")
    db_session.add(agency)
    db_session.flush()

    entry = record_audit_event(
        db_session,
        agency_id=agency.id,
        event_type="brief.submitted",
        payload={"note": "first brief"},
    )

    assert isinstance(entry.id, uuid.UUID)
    assert isinstance(entry, AuditLog)
    assert entry.event_type == "brief.submitted"
    assert entry.payload["note"] == "first brief"
