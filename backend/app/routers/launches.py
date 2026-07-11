import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.agency import Agency
from app.models.brief import CampaignDraft
from app.schemas.launch import LaunchResponse, PlatformLaunchResult
from app.security import get_current_agency
from app.services.audit import record_audit_event
from app.services.campaign_push import push_draft_with_clients
from app.services.google_ads_client import GoogleAdsPushPort, RealGoogleAdsPushClient
from app.services.meta_ads_client import MetaAdsPushPort, RealMetaAdsPushClient

router = APIRouter(prefix="/briefs", tags=["launches"])


def get_google_ads_push_client() -> GoogleAdsPushPort:
    """Overridden in tests with a FakeGoogleAdsPushClient."""
    return RealGoogleAdsPushClient()


def get_meta_ads_push_client() -> MetaAdsPushPort:
    """Overridden in tests with a FakeMetaAdsPushClient."""
    return RealMetaAdsPushClient()


@router.post("/{draft_id}/launch", response_model=LaunchResponse)
def launch_draft(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> LaunchResponse:
    draft = db.get(CampaignDraft, draft_id)
    if draft is None or draft.brief.client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.status != "client_approved":
        raise HTTPException(status_code=409, detail="Draft must be approved by the client before launch")

    client_row = draft.brief.client
    google_ready = bool(client_row.google_refresh_token_encrypted and draft.google_plan_json)
    meta_ready = bool(client_row.meta_access_token_encrypted and draft.meta_plan_json)
    if not google_ready and not meta_ready:
        raise HTTPException(
            status_code=400, detail="Draft has not been generated or client has no connected ad platform"
        )

    records = push_draft_with_clients(
        db, draft.id, google_client=get_google_ads_push_client(), meta_client=get_meta_ads_push_client()
    )

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=draft.brief.client_id,
        event_type="draft.launched",
        payload={"draft_id": str(draft.id)},
    )

    successes = [r for r in records if r.status == "success"]
    failures = [r for r in records if r.status == "failed"]
    primary = successes[0] if successes else failures[0]

    return LaunchResponse(
        status="launched" if successes else "failed",
        external_campaign_id=successes[0].external_campaign_id if successes else None,
        error_message=None if successes else primary.error_message,
        platforms=[
            PlatformLaunchResult(
                platform=r.platform,
                status=r.status,
                external_campaign_id=r.external_campaign_id,
                error_message=r.error_message,
            )
            for r in records
        ],
    )
