import uuid

from pydantic import BaseModel

from app.schemas.brand_voice import BrandVoiceProfileResponse
from app.schemas.client_asset import ClientAssetResponse


class ClientCreateRequest(BaseModel):
    name: str


class ClientGoogleAdAccountRequest(BaseModel):
    customer_id: str


class ClientMetaAdAccountRequest(BaseModel):
    ad_account_id: str


class ClientResponse(BaseModel):
    id: uuid.UUID
    name: str
    google_ads_customer_id: str | None
    meta_ad_account_id: str | None
    google_connected: bool
    meta_connected: bool
    logo_url: str | None = None


class ClientDetailResponse(ClientResponse):
    brand_voice: BrandVoiceProfileResponse | None = None
    assets: list[ClientAssetResponse] = []
