from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.approval import Approval
from app.models.audit import AuditLog
from app.models.brand_voice import BrandVoiceProfile
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.client_asset import ClientAsset
from app.models.guardrail import GuardrailReport
from app.models.launch import LaunchRecord


def delete_client_cascade(db: Session, client: Client) -> None:
    """Deletes a client and everything scoped to it. None of these relationships have
    an ORM/DB cascade configured, so this walks the tree explicitly: guardrail
    reports, approvals, and launch records depend on campaign drafts, which depend on
    briefs, which depend on the client — plus brand voice, uploaded asset files, and
    this client's own audit log entries."""
    brief_ids = list(db.scalars(select(Brief.id).where(Brief.client_id == client.id)))
    draft_ids = list(db.scalars(select(CampaignDraft.id).where(CampaignDraft.brief_id.in_(brief_ids))))

    db.query(GuardrailReport).filter(GuardrailReport.campaign_draft_id.in_(draft_ids)).delete(synchronize_session=False)
    db.query(Approval).filter(Approval.campaign_draft_id.in_(draft_ids)).delete(synchronize_session=False)
    db.query(LaunchRecord).filter(LaunchRecord.campaign_draft_id.in_(draft_ids)).delete(synchronize_session=False)
    db.query(CampaignDraft).filter(CampaignDraft.id.in_(draft_ids)).delete(synchronize_session=False)
    db.query(Brief).filter(Brief.id.in_(brief_ids)).delete(synchronize_session=False)

    settings = get_settings()
    for asset in db.scalars(select(ClientAsset).where(ClientAsset.client_id == client.id)):
        (Path(settings.uploads_dir) / asset.stored_path).unlink(missing_ok=True)
    db.query(ClientAsset).filter(ClientAsset.client_id == client.id).delete(synchronize_session=False)

    db.query(BrandVoiceProfile).filter(BrandVoiceProfile.client_id == client.id).delete(synchronize_session=False)
    db.query(AuditLog).filter(AuditLog.client_id == client.id).delete(synchronize_session=False)

    db.delete(client)
    db.commit()
