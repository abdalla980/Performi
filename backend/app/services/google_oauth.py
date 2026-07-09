from urllib.parse import urlencode

import httpx
from pydantic import BaseModel

from app.config import get_settings

_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_SCOPE = "https://www.googleapis.com/auth/adwords"


class GoogleTokenResponse(BaseModel):
    refresh_token: str
    access_token: str


def build_authorize_url(state: str) -> str:
    settings = get_settings()
    params = {
        "client_id": settings.google_ads_client_id,
        "redirect_uri": settings.google_ads_oauth_redirect_uri,
        "response_type": "code",
        "scope": _SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{_AUTH_BASE}?{urlencode(params)}"


def exchange_code_for_tokens(code: str, http_client: httpx.Client) -> GoogleTokenResponse:
    settings = get_settings()
    response = http_client.post(
        _TOKEN_URL,
        data={
            "code": code,
            "client_id": settings.google_ads_client_id,
            "client_secret": settings.google_ads_client_secret,
            "redirect_uri": settings.google_ads_oauth_redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    response.raise_for_status()
    return GoogleTokenResponse.model_validate(response.json())
