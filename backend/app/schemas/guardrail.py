import uuid
from typing import Literal

from pydantic import BaseModel


class GuardrailFlag(BaseModel):
    severity: Literal["block", "warn"]
    code: str
    message: str


class GuardrailReportResponse(BaseModel):
    id: uuid.UUID
    campaign_draft_id: uuid.UUID
    flags: list[GuardrailFlag]
    has_blocking_flags: bool

    model_config = {"from_attributes": True}
