import uuid

from pydantic import BaseModel, field_validator


class SitelinkInput(BaseModel):
    text: str
    url: str
    description: str | None = None


class BrandVoiceProfileRequest(BaseModel):
    tone: str
    banned_terms: list[str] = []
    required_disclaimers: list[str] = []
    approved_offers: list[str] = []
    sitelinks: list[SitelinkInput] = []


class BrandVoiceProfileResponse(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    tone: str
    banned_terms: list[str]
    required_disclaimers: list[str]
    approved_offers: list[str]
    sitelinks: list[SitelinkInput] = []

    model_config = {"from_attributes": True}

    @field_validator("sitelinks", mode="before")
    @classmethod
    def _coerce_sitelinks(cls, value):
        return value or []
