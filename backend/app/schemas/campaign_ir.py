from datetime import date
from typing import Literal

from pydantic import BaseModel


class AdCopyVariant(BaseModel):
    headline: str
    description: str


class CampaignIR(BaseModel):
    campaign_name: str
    objective: Literal["leads", "sales", "traffic", "awareness"]
    daily_budget_usd: float
    end_date: date | None = None
    keywords: list[str]
    audience_description: str
    ad_copy: list[AdCopyVariant]
    call_to_action: str
