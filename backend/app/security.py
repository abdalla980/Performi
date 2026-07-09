from functools import lru_cache

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWTError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models.agency import Agency

_bearer = HTTPBearer()


@lru_cache
def _get_jwks(jwks_url: str) -> dict:
    """Fetches Supabase Auth's public JWKS (asymmetric signing keys). Cached
    per URL for the process lifetime. Overridden in tests to avoid a real
    network call."""
    response = httpx.get(jwks_url, timeout=5.0)
    response.raise_for_status()
    return response.json()


def get_current_agency(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Agency:
    settings = get_settings()
    try:
        kid = jwt.get_unverified_header(credentials.credentials).get("kid")
        jwks = _get_jwks(settings.supabase_jwks_url)
        jwk_data = next((key for key in jwks["keys"] if key["kid"] == kid), None)
        if jwk_data is None:
            raise PyJWTError(f"Unknown signing key id: {kid}")

        signing_key = jwt.PyJWK.from_dict(jwk_data).key
        payload = jwt.decode(
            credentials.credentials,
            signing_key,
            algorithms=[jwk_data["alg"]],
            audience="authenticated",
        )
        supabase_user_id = payload["sub"]
    except (PyJWTError, KeyError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    agency = db.scalar(select(Agency).where(Agency.supabase_user_id == supabase_user_id))
    if agency is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="No agency linked to this Supabase account"
        )
    return agency
