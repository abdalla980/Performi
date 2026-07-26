from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class PlatformLaunchResult(BaseModel):
    platform: Literal["google", "meta"]
    status: Literal["success", "failed"]
    external_campaign_id: str | None
    error_message: str | None
    attempted_at: datetime


class LaunchResponse(BaseModel):
    status: Literal["launched", "failed"]
    external_campaign_id: str | None
    error_message: str | None
    platforms: list[PlatformLaunchResult]
