from urllib.parse import urlencode

import httpx
from pydantic import BaseModel

from app.config import get_settings

_AUTH_BASE = "https://www.facebook.com/v20.0/dialog/oauth"
_TOKEN_URL = "https://graph.facebook.com/v20.0/oauth/access_token"
_SCOPE = "ads_management,ads_read"


class MetaTokenResponse(BaseModel):
    access_token: str


def build_authorize_url(state: str) -> str:
    settings = get_settings()
    params = {
        "client_id": settings.meta_app_id,
        "redirect_uri": settings.meta_oauth_redirect_uri,
        "scope": _SCOPE,
        "state": state,
        "response_type": "code",
    }
    return f"{_AUTH_BASE}?{urlencode(params)}"


def exchange_code_for_tokens(code: str, http_client: httpx.Client) -> MetaTokenResponse:
    settings = get_settings()
    response = http_client.get(
        _TOKEN_URL,
        params={
            "client_id": settings.meta_app_id,
            "client_secret": settings.meta_app_secret,
            "redirect_uri": settings.meta_oauth_redirect_uri,
            "code": code,
        },
    )
    response.raise_for_status()
    return MetaTokenResponse.model_validate(response.json())
