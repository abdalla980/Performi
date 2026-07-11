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
from app.models.client import Client

_bearer = HTTPBearer()


@lru_cache
def _get_jwks(jwks_url: str) -> dict:
    """Fetches Supabase Auth's public JWKS (asymmetric signing keys). Cached
    per URL for the process lifetime. Overridden in tests to avoid a real
    network call."""
    response = httpx.get(jwks_url, timeout=5.0)
    response.raise_for_status()
    return response.json()


def verify_supabase_token(credentials: HTTPAuthorizationCredentials) -> str:
    """Verifies a Supabase-issued JWT and returns its `sub` claim (the
    Supabase user id) — shared by agency auth, client auth, and /whoami,
    which then each resolve that id against their own table."""
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
        return payload["sub"]
    except (PyJWTError, KeyError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def get_current_agency(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Agency:
    supabase_user_id = verify_supabase_token(credentials)
    agency = db.scalar(select(Agency).where(Agency.supabase_user_id == supabase_user_id))
    if agency is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="No agency linked to this Supabase account"
        )
    return agency


def get_current_client(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Client:
    supabase_user_id = verify_supabase_token(credentials)
    client = db.scalar(select(Client).where(Client.supabase_user_id == supabase_user_id))
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="No client linked to this Supabase account"
        )
    return client
