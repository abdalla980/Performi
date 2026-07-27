from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.guardrail import GuardrailReport
from app.schemas.notifications import NotificationItem
from app.security import get_current_agency

router = APIRouter(prefix="/notifications", tags=["notifications"])

_PENDING_APPROVAL_STALE_DAYS = 3
_CLIENT_PENDING_STALE_DAYS = 5


def _days_since(dt: datetime) -> int:
    reference = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - reference).days


@router.get("", response_model=list[NotificationItem])
def list_notifications(
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> list[NotificationItem]:
    query = (
        select(CampaignDraft)
        .join(Brief, CampaignDraft.brief_id == Brief.id)
        .join(Client, Brief.client_id == Client.id)
        .where(Client.agency_id == agency.id)
    )
    drafts = db.scalars(query).all()

    items: list[NotificationItem] = []
    for draft in drafts:
        client_name = draft.brief.client.name
        days_stale = _days_since(draft.updated_at)

        if draft.status == "failed":
            items.append(NotificationItem(draft_id=draft.id, client_name=client_name, kind="launch_failed", days_stale=days_stale))
            continue

        if draft.status == "guardrail_checked":
            report = db.scalar(select(GuardrailReport).where(GuardrailReport.campaign_draft_id == draft.id))
            if report is not None and report.has_blocking_flags:
                items.append(NotificationItem(draft_id=draft.id, client_name=client_name, kind="guardrail_blocked", days_stale=days_stale))
                continue
            if days_stale >= _PENDING_APPROVAL_STALE_DAYS:
                items.append(NotificationItem(draft_id=draft.id, client_name=client_name, kind="pending_approval_stale", days_stale=days_stale))
            continue

        if draft.status == "approved" and days_stale >= _CLIENT_PENDING_STALE_DAYS:
            items.append(NotificationItem(draft_id=draft.id, client_name=client_name, kind="client_pending_stale", days_stale=days_stale))

    items.sort(key=lambda item: item.days_stale, reverse=True)
    return items
