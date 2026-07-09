import uuid

from pydantic import BaseModel

from app.schemas.brand_voice import BrandVoiceProfileResponse


class ClientCreateRequest(BaseModel):
    name: str


class ClientResponse(BaseModel):
    id: uuid.UUID
    name: str
    google_ads_customer_id: str | None
    meta_ad_account_id: str | None
    google_connected: bool
    meta_connected: bool


class ClientDetailResponse(ClientResponse):
    brand_voice: BrandVoiceProfileResponse | None = None
