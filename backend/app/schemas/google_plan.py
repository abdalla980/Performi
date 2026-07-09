from datetime import date

from pydantic import BaseModel


class GoogleAdGroup(BaseModel):
    name: str
    keywords: list[str]
    headlines: list[str]
    descriptions: list[str]


class GoogleCampaignPlan(BaseModel):
    campaign_name: str
    daily_budget_micros: int
    end_date: date | None = None
    ad_groups: list[GoogleAdGroup]
