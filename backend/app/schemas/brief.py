import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.google_plan import GoogleCampaignPlan
from app.schemas.guardrail import GuardrailReportResponse
from app.schemas.launch import PlatformLaunchResult
from app.schemas.meta_plan import MetaCampaignPlan
from app.schemas.projection import ProjectedMetrics


class BriefCreateRequest(BaseModel):
    client_id: uuid.UUID
    business_description: str
    budget_usd: float
    goals: str
    website_url: str | None = None
    target_location: str | None = None
    target_audience: str | None = None
    end_date: date | None = None
    platforms: list[Literal["google", "meta"]] = ["google", "meta"]
    competitors: str | None = None
    unique_selling_points: str | None = None
    excluded_keywords: list[str] = []


class BriefBatchCreateRequest(BaseModel):
    briefs: list[BriefCreateRequest]


class CampaignDraftResponse(BaseModel):
    id: uuid.UUID
    brief_id: uuid.UUID
    status: str

    model_config = {"from_attributes": True}


class DraftSummaryResponse(BaseModel):
    id: uuid.UUID
    brief_id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    status: str
    business_description: str
    budget_usd: float
    goals: str
    guardrail_flag_count: int
    has_blocking_flags: bool
    created_at: datetime


class DraftDetailResponse(DraftSummaryResponse):
    website_url: str | None = None
    target_location: str | None = None
    target_audience: str | None = None
    end_date: date | None = None
    platforms: list[str] = []
    competitors: str | None = None
    unique_selling_points: str | None = None
    excluded_keywords: list[str] = []
    google_plan: GoogleCampaignPlan | None = None
    meta_plan: MetaCampaignPlan | None = None
    guardrail: GuardrailReportResponse | None = None
    launches: list[PlatformLaunchResult] = []
    projected_metrics: ProjectedMetrics | None = None
