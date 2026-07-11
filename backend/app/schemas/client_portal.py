import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.google_plan import GoogleCampaignPlan
from app.schemas.launch import PlatformLaunchResult
from app.schemas.meta_plan import MetaCampaignPlan
from app.schemas.projection import ProjectedMetrics


class ClientPortalCampaignSummary(BaseModel):
    id: uuid.UUID
    brief_id: uuid.UUID
    status: str
    business_description: str
    budget_usd: float
    goals: str
    created_at: datetime


class ClientPortalCampaignDetail(ClientPortalCampaignSummary):
    website_url: str | None = None
    target_location: str | None = None
    target_audience: str | None = None
    end_date: date | None = None
    platforms: list[str] = []
    google_plan: GoogleCampaignPlan | None = None
    meta_plan: MetaCampaignPlan | None = None
    projected_metrics: ProjectedMetrics | None = None
    launches: list[PlatformLaunchResult] = []


class ClientDecisionRequest(BaseModel):
    decision: Literal["approved", "rejected"]


class ClientDecisionResponse(BaseModel):
    status: str
