import uuid
from typing import Literal

from pydantic import BaseModel

from app.schemas.google_plan import GoogleCampaignPlan
from app.schemas.meta_plan import MetaCampaignPlan


class GenerateDraftResponse(BaseModel):
    id: uuid.UUID
    brief_id: uuid.UUID
    status: str
    mode: Literal["live", "demo"] = "live"
    google_plan: GoogleCampaignPlan
    meta_plan: MetaCampaignPlan
