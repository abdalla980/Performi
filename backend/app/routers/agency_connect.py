import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.encryption import encrypt_token
from app.models.agency import Agency
from app.schemas.agency_connect import GoogleManagerAccountRequest
from app.schemas.oauth import OAuthAuthorizeUrlResponse
from app.security import get_current_agency
from app.services.audit import record_audit_event
from app.services.google_oauth import build_authorize_url, exchange_code_for_tokens
from app.services import meta_oauth

router = APIRouter(prefix="/agency", tags=["agency-connect"])


@router.get("/google/oauth/start", response_model=OAuthAuthorizeUrlResponse)
def google_oauth_start(agency: Agency = Depends(get_current_agency)) -> OAuthAuthorizeUrlResponse:
    """Authenticated SPA fetch — frontend then navigates to authorize_url."""
    return OAuthAuthorizeUrlResponse(authorize_url=build_authorize_url(state=str(agency.id)))


@router.get("/google/oauth/callback")
def google_oauth_callback(
    state: str,
    code: str,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Must match GOOGLE_ADS_OAUTH_REDIRECT_URI. No Authorization header — agency from `state`."""
    settings = get_settings()
    try:
        agency_id = uuid.UUID(state)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Agency not found") from exc

    agency = db.get(Agency, agency_id)
    if agency is None:
        raise HTTPException(status_code=404, detail="Agency not found")

    tokens = exchange_code_for_tokens(code, http_client=httpx.Client())
    agency.google_ads_refresh_token_encrypted = encrypt_token(tokens.refresh_token)
    db.commit()

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=None,
        event_type="agency.google_connected",
        payload={},
    )
    return RedirectResponse(f"{settings.frontend_base_url}/settings?connected=google")


@router.get("/meta/oauth/start", response_model=OAuthAuthorizeUrlResponse)
def meta_oauth_start(agency: Agency = Depends(get_current_agency)) -> OAuthAuthorizeUrlResponse:
    return OAuthAuthorizeUrlResponse(authorize_url=meta_oauth.build_authorize_url(state=str(agency.id)))


@router.get("/meta/oauth/callback")
def meta_oauth_callback(
    state: str,
    code: str,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Must match META_OAUTH_REDIRECT_URI. No Authorization header — agency from `state`."""
    settings = get_settings()
    try:
        agency_id = uuid.UUID(state)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Agency not found") from exc

    agency = db.get(Agency, agency_id)
    if agency is None:
        raise HTTPException(status_code=404, detail="Agency not found")

    tokens = meta_oauth.exchange_code_for_tokens(code, http_client=httpx.Client())
    agency.meta_access_token_encrypted = encrypt_token(tokens.access_token)
    db.commit()

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=None,
        event_type="agency.meta_connected",
        payload={},
    )
    return RedirectResponse(f"{settings.frontend_base_url}/settings?connected=meta")


@router.put("/google/manager-account")
def set_google_manager_account(
    body: GoogleManagerAccountRequest,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> dict[str, str]:
    if agency.google_ads_refresh_token_encrypted is None:
        raise HTTPException(
            status_code=409,
            detail="Connect your Google Ads Manager Account in Settings first",
        )
    agency.google_ads_login_customer_id = body.login_customer_id
    db.commit()
    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=None,
        event_type="agency.google_manager_account_set",
        payload={"login_customer_id": body.login_customer_id},
    )
    return {"status": "ok", "login_customer_id": body.login_customer_id}
