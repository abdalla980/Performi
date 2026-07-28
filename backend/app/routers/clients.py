import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.encryption import encrypt_token
from app.models.agency import Agency
from app.models.brand_voice import BrandVoiceProfile
from app.models.client import Client
from app.schemas.brand_voice import BrandVoiceProfileRequest, BrandVoiceProfileResponse
from app.routers.client_assets import client_logo_url, to_client_asset_response
from app.schemas.client import (
    ClientCreateRequest,
    ClientDetailResponse,
    ClientGoogleAdAccountRequest,
    ClientMetaAdAccountRequest,
    ClientResponse,
)
from app.schemas.oauth import OAuthAuthorizeUrlResponse
from app.security import get_current_agency
from app.services.audit import record_audit_event
from app.services.client_deletion import delete_client_cascade
from app.services.google_oauth import build_authorize_url, exchange_code_for_tokens
from app.services import meta_oauth

router = APIRouter(prefix="/clients", tags=["clients"])


def _get_owned_client(db: Session, client_id: uuid.UUID, agency: Agency) -> Client:
    client = db.get(Client, client_id)
    if client is None or client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


def _client_response(client: Client) -> ClientResponse:
    return ClientResponse(
        id=client.id,
        name=client.name,
        google_ads_customer_id=client.google_ads_customer_id,
        meta_ad_account_id=client.meta_ad_account_id,
        google_connected=client.google_refresh_token_encrypted is not None,
        meta_connected=client.meta_access_token_encrypted is not None,
        logo_url=client_logo_url(client),
    )


@router.post("", response_model=ClientResponse)
def create_client(
    body: ClientCreateRequest,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> ClientResponse:
    client = Client(agency_id=agency.id, name=body.name)
    db.add(client)
    db.commit()
    db.refresh(client)
    return _client_response(client)


@router.get("", response_model=list[ClientResponse])
def list_clients(
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> list[ClientResponse]:
    clients = db.scalars(select(Client).where(Client.agency_id == agency.id)).all()
    return [_client_response(client) for client in clients]


@router.get("/{client_id}", response_model=ClientDetailResponse)
def get_client_detail(
    client_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> ClientDetailResponse:
    client = _get_owned_client(db, client_id, agency)
    return ClientDetailResponse(
        **_client_response(client).model_dump(),
        brand_voice=BrandVoiceProfileResponse.model_validate(client.brand_voice_profile)
        if client.brand_voice_profile
        else None,
        assets=[to_client_asset_response(asset) for asset in client.assets],
    )


@router.delete("/{client_id}")
def delete_client(
    client_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> dict[str, str]:
    client = _get_owned_client(db, client_id, agency)
    client_name = client.name
    delete_client_cascade(db, client)

    record_audit_event(
        db, agency_id=agency.id, client_id=None, event_type="client.deleted", payload={"client_name": client_name}
    )
    return {"status": "deleted"}


@router.put("/{client_id}/brand-voice", response_model=BrandVoiceProfileResponse)
def set_brand_voice(
    client_id: uuid.UUID,
    body: BrandVoiceProfileRequest,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> BrandVoiceProfile:
    client = _get_owned_client(db, client_id, agency)

    profile = client.brand_voice_profile
    if profile is None:
        profile = BrandVoiceProfile(client_id=client.id)
        db.add(profile)

    profile.tone = body.tone
    profile.banned_terms = body.banned_terms
    profile.required_disclaimers = body.required_disclaimers
    profile.approved_offers = body.approved_offers
    profile.sitelinks = [s.model_dump() for s in body.sitelinks]
    db.commit()
    db.refresh(profile)

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=client.id,
        event_type="client.brand_voice_set",
        payload={},
    )
    return profile


@router.get("/{client_id}/google/oauth/start", response_model=OAuthAuthorizeUrlResponse)
def google_oauth_start(
    client_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> OAuthAuthorizeUrlResponse:
    """Called via an authenticated fetch from the SPA (not a raw browser navigation),
    so the Authorization header still applies here. The frontend does the actual
    browser redirect to authorize_url itself once it has this response."""
    _get_owned_client(db, client_id, agency)
    return OAuthAuthorizeUrlResponse(authorize_url=build_authorize_url(state=str(client_id)))


@router.get("/google/oauth/callback")
def google_oauth_callback(
    state: str,
    code: str,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """This path must exactly match GOOGLE_ADS_OAUTH_REDIRECT_URI (registered with
    Google) since it's hit by a raw browser redirect from Google's consent screen,
    which carries no Authorization header — client identity comes from `state`
    (set to the client_id by google_oauth_start) instead of get_current_agency.
    Ownership was already checked when that agency called /oauth/start."""
    settings = get_settings()
    client = db.get(Client, uuid.UUID(state))
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")

    tokens = exchange_code_for_tokens(code, http_client=httpx.Client())
    client.google_refresh_token_encrypted = encrypt_token(tokens.refresh_token)
    db.commit()

    record_audit_event(
        db,
        agency_id=client.agency_id,
        client_id=client.id,
        event_type="client.google_connected",
        payload={},
    )
    return RedirectResponse(f"{settings.frontend_base_url}/clients/{client.id}?connected=google")


@router.get("/{client_id}/meta/oauth/start", response_model=OAuthAuthorizeUrlResponse)
def meta_oauth_start(
    client_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> OAuthAuthorizeUrlResponse:
    _get_owned_client(db, client_id, agency)
    return OAuthAuthorizeUrlResponse(authorize_url=meta_oauth.build_authorize_url(state=str(client_id)))


@router.get("/meta/oauth/callback")
def meta_oauth_callback(
    state: str,
    code: str,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """See google_oauth_callback — same reasoning applies (must match
    META_OAUTH_REDIRECT_URI exactly, no Authorization header available)."""
    settings = get_settings()
    client = db.get(Client, uuid.UUID(state))
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")

    tokens = meta_oauth.exchange_code_for_tokens(code, http_client=httpx.Client())
    client.meta_access_token_encrypted = encrypt_token(tokens.access_token)
    db.commit()

    record_audit_event(
        db,
        agency_id=client.agency_id,
        client_id=client.id,
        event_type="client.meta_connected",
        payload={},
    )
    return RedirectResponse(f"{settings.frontend_base_url}/clients/{client.id}?connected=meta")


@router.put("/{client_id}/google/ad-account", response_model=ClientResponse)
def set_google_ad_account(
    client_id: uuid.UUID,
    body: ClientGoogleAdAccountRequest,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> ClientResponse:
    """The real OAuth callback only stores a refresh token — it has no way to know
    which Google Ads customer ID the agency wants to push to (a Google account can
    have access to many), so that has to be set explicitly, once a real connect has
    already happened."""
    client = _get_owned_client(db, client_id, agency)
    if client.google_refresh_token_encrypted is None:
        raise HTTPException(status_code=409, detail="Connect Google Ads before setting a customer ID")
    client.google_ads_customer_id = body.customer_id
    db.commit()
    db.refresh(client)
    return _client_response(client)


@router.put("/{client_id}/meta/ad-account", response_model=ClientResponse)
def set_meta_ad_account(
    client_id: uuid.UUID,
    body: ClientMetaAdAccountRequest,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> ClientResponse:
    """See set_google_ad_account — same reasoning, the real Meta OAuth callback only
    stores an access token, never which ad account to push to."""
    client = _get_owned_client(db, client_id, agency)
    if client.meta_access_token_encrypted is None:
        raise HTTPException(status_code=409, detail="Connect Meta before setting an ad account ID")
    client.meta_ad_account_id = body.ad_account_id
    db.commit()
    db.refresh(client)
    return _client_response(client)


@router.post("/{client_id}/google/demo-connect")
def google_demo_connect(
    client_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> dict[str, str]:
    """Fakes a Google Ads OAuth connect for pilots without live Google Ads credentials
    yet — used instead of google_oauth_start/callback when GOOGLE_ADS_CLIENT_ID isn't
    configured (see /config/status)."""
    client = _get_owned_client(db, client_id, agency)
    client.google_ads_customer_id = f"demo-{str(client_id)[:8]}"
    client.google_refresh_token_encrypted = encrypt_token("demo-google-refresh-token")
    db.commit()

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=client.id,
        event_type="client.google_connected_demo",
        payload={},
    )
    return {"status": "connected", "mode": "demo"}


@router.post("/{client_id}/meta/demo-connect")
def meta_demo_connect(
    client_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> dict[str, str]:
    """Fakes a Meta OAuth connect for pilots without live Meta app credentials yet —
    used instead of meta_oauth_start/callback when META_APP_ID isn't configured (see
    /config/status)."""
    client = _get_owned_client(db, client_id, agency)
    client.meta_ad_account_id = f"demo-{str(client_id)[:8]}"
    client.meta_access_token_encrypted = encrypt_token("demo-meta-access-token")
    db.commit()

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=client.id,
        event_type="client.meta_connected_demo",
        payload={},
    )
    return {"status": "connected", "mode": "demo"}
