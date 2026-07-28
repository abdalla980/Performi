from typing import Literal

from pydantic import BaseModel

from app.schemas.campaign_ir import CampaignIR


class ApprovalRequest(BaseModel):
    decision: Literal["approved", "rejected"]
    edited_ir: CampaignIR | None = None
    reviewer_note: str | None = None


class ApprovalResponse(BaseModel):
    status: str


class ActAsClientRequest(BaseModel):
    decision: Literal["approved", "rejected"]
