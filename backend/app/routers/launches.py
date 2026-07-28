import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.agency import Agency
from app.models.brief import CampaignDraft
from app.models.client import Client
from app.schemas.launch import LaunchResponse, PlatformLaunchResult
from app.security import get_current_agency
from app.services.audit import record_audit_event
from app.services.campaign_push import push_draft_with_clients
from app.services.google_ads_client import DemoAwareGoogleAdsPushClient, GoogleAdsPushPort
from app.services.meta_ads_client import DemoAwareMetaAdsPushClient, MetaAdsPushPort

router = APIRouter(prefix="/briefs", tags=["launches"])


def get_google_ads_push_client() -> GoogleAdsPushPort:
    """Overridden in tests with a FakeGoogleAdsPushClient. Defaults to the demo-aware
    wrapper (not RealGoogleAdsPushClient directly) so demo-connected clients don't hit
    the real API with fabricated credentials."""
    return DemoAwareGoogleAdsPushClient()


def get_meta_ads_push_client() -> MetaAdsPushPort:
    """Overridden in tests with a FakeMetaAdsPushClient. Defaults to the demo-aware
    wrapper (not RealMetaAdsPushClient directly) — see DemoAwareMetaAdsPushClient."""
    return DemoAwareMetaAdsPushClient()


def _launch_blocker_reason(agency: Agency, client: Client, draft: CampaignDraft) -> str:
    """Distinguishes the three different reasons launch can't proceed, so the agency
    knows exactly what to go do next instead of one generic, unactionable message."""
    if draft.google_plan_json is None and draft.meta_plan_json is None:
        return "This campaign hasn't been generated yet."

    unlinked = []
    if draft.google_plan_json is not None and not client.google_ads_customer_id:
        unlinked.append("Google Ads")
    if draft.meta_plan_json is not None and not client.meta_ad_account_id:
        unlinked.append("Meta")
    if unlinked:
        return (
            f"This client isn't linked to a {' or '.join(unlinked)} account yet — "
            "connect one (demo or real) on the client's page."
        )

    if draft.google_plan_json is not None and not (
        agency.google_ads_refresh_token_encrypted and agency.google_ads_login_customer_id
    ):
        return "Connect your Google Ads Manager Account in Settings before launching."
    if draft.meta_plan_json is not None and not agency.meta_access_token_encrypted:
        return "Connect your Meta Business Manager in Settings before launching."

    return "This campaign can't be launched yet — check its platform connections."


@router.post("/{draft_id}/launch", response_model=LaunchResponse)
def launch_draft(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> LaunchResponse:
    draft = db.get(CampaignDraft, draft_id)
    if draft is None or draft.brief.client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.status not in ("client_approved", "failed"):
        raise HTTPException(status_code=409, detail="Draft must be approved by the client before launch")

    client_row = draft.brief.client
    google_ready = bool(
        agency.google_ads_refresh_token_encrypted
        and agency.google_ads_login_customer_id
        and client_row.google_ads_customer_id
        and draft.google_plan_json
    )
    meta_ready = bool(
        agency.meta_access_token_encrypted and client_row.meta_ad_account_id and draft.meta_plan_json
    )
    if not google_ready and not meta_ready:
        raise HTTPException(status_code=400, detail=_launch_blocker_reason(agency, client_row, draft))

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
                attempted_at=r.attempted_at,
            )
            for r in records
        ],
    )
