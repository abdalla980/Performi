import uuid

from pydantic import BaseModel


class BrandVoiceProfileRequest(BaseModel):
    tone: str
    banned_terms: list[str] = []
    required_disclaimers: list[str] = []
    approved_offers: list[str] = []


class BrandVoiceProfileResponse(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    tone: str
    banned_terms: list[str]
    required_disclaimers: list[str]
    approved_offers: list[str]

    model_config = {"from_attributes": True}
