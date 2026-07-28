from datetime import date
from typing import Literal

from pydantic import BaseModel


class GoogleKeyword(BaseModel):
    text: str
    match_type: Literal["exact", "phrase", "broad"] = "phrase"


class GoogleAdGroup(BaseModel):
    name: str
    keywords: list[GoogleKeyword]
    headlines: list[str]
    descriptions: list[str]


class Sitelink(BaseModel):
    text: str
    url: str
    description: str | None = None


class GoogleCampaignPlan(BaseModel):
    campaign_name: str
    daily_budget_micros: int
    end_date: date | None = None
    final_url: str | None = None
    negative_keywords: list[str] = []
    ad_groups: list[GoogleAdGroup]
    callouts: list[str] = []
    structured_snippets: dict[str, list[str]] = {}
    sitelinks: list[Sitelink] = []
