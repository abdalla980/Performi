import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.launch import LaunchRecord
from app.schemas.campaign_ir import CampaignIR
from app.schemas.client_portal import (
    ClientDecisionRequest,
    ClientDecisionResponse,
    ClientPortalCampaignDetail,
    ClientPortalCampaignSummary,
)
from app.schemas.google_plan import GoogleCampaignPlan
from app.schemas.launch import PlatformLaunchResult
from app.schemas.meta_plan import MetaCampaignPlan
from app.security import get_current_client
from app.services.audit import record_audit_event
from app.services.projections import compute_projected_metrics

router = APIRouter(prefix="/portal", tags=["client-portal"])

# A client only ever sees a campaign once the agency has QA'd and approved it —
# earlier stages (guardrail flags, in-progress agency work) stay agency-only.
_VISIBLE_STATUSES = {"approved", "client_approved", "client_rejected", "launched", "failed"}


def _summary(draft: CampaignDraft) -> ClientPortalCampaignSummary:
    return ClientPortalCampaignSummary(
        id=draft.id,
        brief_id=draft.brief_id,
        status=draft.status,
        business_description=draft.brief.business_description,
        budget_usd=draft.brief.budget_usd,
        goals=draft.brief.goals,
        created_at=draft.created_at,
    )


def _detail(db: Session, draft: CampaignDraft) -> ClientPortalCampaignDetail:
    launches = db.scalars(select(LaunchRecord).where(LaunchRecord.campaign_draft_id == draft.id)).all()
    return ClientPortalCampaignDetail(
        **_summary(draft).model_dump(),
        website_url=draft.brief.website_url,
        target_location=draft.brief.target_location,
        target_audience=draft.brief.target_audience,
        end_date=draft.brief.end_date,
        platforms=draft.brief.platforms,
        google_plan=GoogleCampaignPlan.model_validate(draft.google_plan_json) if draft.google_plan_json else None,
        meta_plan=MetaCampaignPlan.model_validate(draft.meta_plan_json) if draft.meta_plan_json else None,
        projected_metrics=compute_projected_metrics(
            CampaignIR.model_validate(draft.ir_json), draft.brief.platforms, bool(draft.brief.target_location)
        )
        if draft.ir_json
        else None,
        launches=[
            PlatformLaunchResult(
                platform=launch.platform,
                status=launch.status,
                external_campaign_id=launch.external_campaign_id,
                error_message=launch.error_message,
            )
            for launch in launches
        ],
    )


@router.get("/campaigns", response_model=list[ClientPortalCampaignSummary])
def list_campaigns(
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
) -> list[ClientPortalCampaignSummary]:
    query = (
        select(CampaignDraft)
        .join(Brief, CampaignDraft.brief_id == Brief.id)
        .where(Brief.client_id == client.id)
        .order_by(CampaignDraft.created_at.desc())
    )
    drafts = db.scalars(query).all()
    return [_summary(draft) for draft in drafts if draft.status in _VISIBLE_STATUSES]


@router.get("/campaigns/{draft_id}", response_model=ClientPortalCampaignDetail)
def get_campaign_detail(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
) -> ClientPortalCampaignDetail:
    draft = db.get(CampaignDraft, draft_id)
    if draft is None or draft.brief.client_id != client.id or draft.status not in _VISIBLE_STATUSES:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return _detail(db, draft)


@router.post("/campaigns/{draft_id}/decision", response_model=ClientDecisionResponse)
def decide_campaign(
    draft_id: uuid.UUID,
    body: ClientDecisionRequest,
    db: Session = Depends(get_db),
    client: Client = Depends(get_current_client),
) -> ClientDecisionResponse:
    draft = db.get(CampaignDraft, draft_id)
    if draft is None or draft.brief.client_id != client.id:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if draft.status != "approved":
        raise HTTPException(status_code=409, detail="Campaign is not awaiting your approval")

    draft.status = "client_approved" if body.decision == "approved" else "client_rejected"
    db.commit()

    record_audit_event(
        db,
        agency_id=client.agency_id,
        client_id=client.id,
        event_type=f"draft.{draft.status}",
        payload={"draft_id": str(draft.id)},
    )
    return ClientDecisionResponse(status=draft.status)
