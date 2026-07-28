from datetime import date
from typing import Literal

from pydantic import BaseModel


class AdCopyVariant(BaseModel):
    headline: str
    description: str


class KeywordEntry(BaseModel):
    text: str
    match_type: Literal["exact", "phrase", "broad"] = "phrase"


class AudienceSegment(BaseModel):
    name: str
    description: str
    age_min: int | None = None
    age_max: int | None = None
    interests: list[str] = []
    keywords: list[KeywordEntry]
    ad_copy: list[AdCopyVariant]


class CampaignIR(BaseModel):
    campaign_name: str
    objective: Literal["leads", "sales", "traffic", "awareness"]
    daily_budget_usd: float
    end_date: date | None = None
    audience_segments: list[AudienceSegment]
    call_to_action: str
    website_url: str | None = None
    negative_keywords: list[str] = []
    callouts: list[str] = []
    structured_snippets: dict[str, list[str]] = {}
