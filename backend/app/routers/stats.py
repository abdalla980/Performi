from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.guardrail import GuardrailReport
from app.schemas.stats import ImpactStatsResponse
from app.security import get_current_agency

router = APIRouter(prefix="/stats", tags=["stats"])

_HOURS_SAVED_PER_CAMPAIGN = 2.0


@router.get("/impact", response_model=ImpactStatsResponse)
def get_impact_stats(
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> ImpactStatsResponse:
    launched_query = (
        select(CampaignDraft)
        .join(Brief, CampaignDraft.brief_id == Brief.id)
        .join(Client, Brief.client_id == Client.id)
        .where(Client.agency_id == agency.id, CampaignDraft.status == "launched")
    )
    campaigns_launched = len(db.scalars(launched_query).all())

    reports_query = (
        select(GuardrailReport)
        .join(CampaignDraft, GuardrailReport.campaign_draft_id == CampaignDraft.id)
        .join(Brief, CampaignDraft.brief_id == Brief.id)
        .join(Client, Brief.client_id == Client.id)
        .where(Client.agency_id == agency.id)
    )
    guardrail_issues_caught = sum(len(report.flags_json) for report in db.scalars(reports_query).all())

    return ImpactStatsResponse(
        campaigns_launched=campaigns_launched,
        estimated_hours_saved=campaigns_launched * _HOURS_SAVED_PER_CAMPAIGN,
        guardrail_issues_caught=guardrail_issues_caught,
    )
