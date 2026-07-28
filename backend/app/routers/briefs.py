import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.guardrail import GuardrailReport
from app.models.launch import LaunchRecord
from app.routers.client_assets import client_logo_url
from app.schemas.brief import (
    BriefBatchCreateRequest,
    BriefCreateRequest,
    DraftDetailResponse,
    DraftSummaryResponse,
)
from app.schemas.campaign_ir import CampaignIR
from app.schemas.google_plan import GoogleCampaignPlan
from app.schemas.guardrail import GuardrailFlag, GuardrailReportResponse
from app.schemas.launch import PlatformLaunchResult
from app.schemas.meta_plan import MetaCampaignPlan
from app.security import get_current_agency
from app.services.audit import record_audit_event
from app.services.projections import compute_projected_metrics

router = APIRouter(prefix="/briefs", tags=["briefs"])


def _get_report(db: Session, draft_id: uuid.UUID) -> GuardrailReport | None:
    return db.scalar(select(GuardrailReport).where(GuardrailReport.campaign_draft_id == draft_id))


def _launch_results(launches: list[LaunchRecord] | None) -> list[PlatformLaunchResult]:
    if not launches:
        return []
    return [
        PlatformLaunchResult(
            platform=launch.platform,
            status=launch.status,
            external_campaign_id=launch.external_campaign_id,
            error_message=launch.error_message,
            attempted_at=launch.attempted_at,
        )
        for launch in launches
    ]


def _draft_summary(
    draft: CampaignDraft,
    report: GuardrailReport | None,
    launches: list[LaunchRecord] | None = None,
) -> DraftSummaryResponse:
    return DraftSummaryResponse(
        id=draft.id,
        brief_id=draft.brief_id,
        client_id=draft.brief.client_id,
        client_name=draft.brief.client.name,
        client_logo_url=client_logo_url(draft.brief.client),
        platforms=draft.brief.platforms,
        status=draft.status,
        business_description=draft.brief.business_description,
        budget_usd=draft.brief.budget_usd,
        goals=draft.brief.goals,
        guardrail_flag_count=len(report.flags_json) if report else 0,
        has_blocking_flags=report.has_blocking_flags if report else False,
        created_at=draft.created_at,
        launches=_launch_results(launches),
    )


def _draft_detail(db: Session, draft: CampaignDraft) -> DraftDetailResponse:
    report = _get_report(db, draft.id)
    launches = list(db.scalars(select(LaunchRecord).where(LaunchRecord.campaign_draft_id == draft.id)).all())
    return DraftDetailResponse(
        **_draft_summary(draft, report, launches=launches).model_dump(),
        website_url=draft.brief.website_url,
        target_location=draft.brief.target_location,
        target_audience=draft.brief.target_audience,
        end_date=draft.brief.end_date,
        competitors=draft.brief.competitors,
        unique_selling_points=draft.brief.unique_selling_points,
        excluded_keywords=draft.brief.excluded_keywords,
        services_offered=draft.brief.services_offered or [],
        trust_signals=draft.brief.trust_signals or [],
        audience_hints=draft.brief.audience_hints or [],
        google_plan=GoogleCampaignPlan.model_validate(draft.google_plan_json) if draft.google_plan_json else None,
        meta_plan=MetaCampaignPlan.model_validate(draft.meta_plan_json) if draft.meta_plan_json else None,
        guardrail=GuardrailReportResponse(
            id=report.id,
            campaign_draft_id=report.campaign_draft_id,
            flags=[GuardrailFlag.model_validate(f) for f in report.flags_json],
            has_blocking_flags=report.has_blocking_flags,
        )
        if report
        else None,
        projected_metrics=compute_projected_metrics(
            CampaignIR.model_validate(draft.ir_json),
            draft.brief.platforms,
            bool(draft.brief.target_location),
        )
        if draft.ir_json
        else None,
    )


def _create_one(body: BriefCreateRequest, db: Session, agency: Agency) -> CampaignDraft:
    client = db.get(Client, body.client_id)
    if client is None or client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail=f"Client {body.client_id} not found")

    brief = Brief(
        client_id=client.id,
        business_description=body.business_description,
        budget_usd=body.budget_usd,
        goals=body.goals,
        website_url=body.website_url,
        target_location=body.target_location,
        target_audience=body.target_audience,
        end_date=body.end_date,
        platforms=body.platforms,
        competitors=body.competitors,
        unique_selling_points=body.unique_selling_points,
        excluded_keywords=body.excluded_keywords,
        services_offered=body.services_offered,
        trust_signals=body.trust_signals,
        audience_hints=[h.model_dump() for h in body.audience_hints],
    )
    db.add(brief)
    db.flush()

    draft = CampaignDraft(brief_id=brief.id)
    db.add(draft)
    db.commit()
    db.refresh(draft)

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=client.id,
        event_type="brief.submitted",
        payload={"brief_id": str(brief.id)},
    )
    return draft


@router.post("", response_model=DraftSummaryResponse, status_code=status.HTTP_201_CREATED)
def submit_brief(
    body: BriefCreateRequest,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> DraftSummaryResponse:
    draft = _create_one(body, db, agency)
    return _draft_summary(draft, None)


@router.post("/batch", response_model=list[DraftSummaryResponse], status_code=status.HTTP_201_CREATED)
def submit_briefs_batch(
    body: BriefBatchCreateRequest,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> list[DraftSummaryResponse]:
    drafts = [_create_one(b, db, agency) for b in body.briefs]
    return [_draft_summary(draft, None) for draft in drafts]


@router.get("", response_model=list[DraftSummaryResponse])
def list_briefs(
    client_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> list[DraftSummaryResponse]:
    query = (
        select(CampaignDraft)
        .join(Brief, CampaignDraft.brief_id == Brief.id)
        .join(Client, Brief.client_id == Client.id)
        .where(Client.agency_id == agency.id, CampaignDraft.archived_at.is_(None))
        .order_by(CampaignDraft.created_at.desc())
    )
    if client_id is not None:
        query = query.where(Brief.client_id == client_id)
    drafts = list(db.scalars(query).all())
    draft_ids = [draft.id for draft in drafts]
    launches_by_draft: dict[uuid.UUID, list[LaunchRecord]] = {draft_id: [] for draft_id in draft_ids}
    if draft_ids:
        launch_rows = db.scalars(select(LaunchRecord).where(LaunchRecord.campaign_draft_id.in_(draft_ids))).all()
        for launch in launch_rows:
            launches_by_draft[launch.campaign_draft_id].append(launch)
    return [
        _draft_summary(draft, _get_report(db, draft.id), launches=launches_by_draft.get(draft.id))
        for draft in drafts
    ]


@router.get("/{draft_id}", response_model=DraftDetailResponse)
def get_brief_detail(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> DraftDetailResponse:
    draft = db.get(CampaignDraft, draft_id)
    if draft is None or draft.brief.client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _draft_detail(db, draft)


@router.post("/{draft_id}/archive", response_model=DraftSummaryResponse)
def archive_draft(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> DraftSummaryResponse:
    draft = db.get(CampaignDraft, draft_id)
    if draft is None or draft.brief.client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.status != "launched":
        raise HTTPException(status_code=409, detail="Only launched campaigns can be archived")

    draft.archived_at = datetime.now(timezone.utc)
    db.commit()

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=draft.brief.client_id,
        event_type="draft.archived",
        payload={"draft_id": str(draft.id)},
    )
    launches = list(db.scalars(select(LaunchRecord).where(LaunchRecord.campaign_draft_id == draft.id)).all())
    return _draft_summary(draft, _get_report(db, draft.id), launches=launches)
