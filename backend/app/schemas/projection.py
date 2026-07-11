from typing import Literal

from pydantic import BaseModel


class PlatformProjection(BaseModel):
    platform: Literal["google", "meta"]
    daily_budget_usd: float
    estimated_daily_clicks: float
    estimated_daily_impressions: int


class ProjectedMetrics(BaseModel):
    platforms: list[PlatformProjection]
    estimated_location_reach: int | None = None
