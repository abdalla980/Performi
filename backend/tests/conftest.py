import base64

import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401  ensures all models are registered on Base
from app.db import Base
from app.main import app

_TEST_KID = "test-signing-key-1"
_TEST_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _test_jwks() -> dict:
    numbers = _TEST_PRIVATE_KEY.public_key().public_numbers()
    return {
        "keys": [
            {
                "kty": "EC",
                "crv": "P-256",
                "alg": "ES256",
                "use": "sig",
                "kid": _TEST_KID,
                "x": _b64url(numbers.x.to_bytes(32, "big")),
                "y": _b64url(numbers.y.to_bytes(32, "big")),
            }
        ]
    }


@pytest.fixture(autouse=True)
def _stub_supabase_jwks(monkeypatch):
    """Every request's Authorization header in these tests is signed by
    make_supabase_jwt() below with an in-memory EC keypair. This stubs
    app.security's real network JWKS fetch so it verifies against that same
    keypair, mirroring Supabase's real asymmetric JWT signing keys without a
    network call."""
    from app import security

    monkeypatch.setattr(security, "_get_jwks", lambda jwks_url: _test_jwks())


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture()
def db_session() -> Session:
    # StaticPool forces every connection checkout to reuse the same underlying
    # connection — without it, SQLite's `:memory:` database is per-connection, so a
    # session that commits and a session that later queries can land on two separate,
    # independently-empty in-memory databases.
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


def make_supabase_jwt(supabase_user_id: str) -> str:
    """Mints a JWT shaped like one Supabase Auth would issue, signed with an
    in-memory ES256 keypair whose public half is served via the
    _stub_supabase_jwks fixture above. Test-only — real tokens are always
    minted by Supabase itself, never by this backend."""
    private_pem = _TEST_PRIVATE_KEY.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    payload = {"sub": supabase_user_id, "aud": "authenticated", "email": f"{supabase_user_id}@test.supabase"}
    return pyjwt.encode(payload, private_pem, algorithm="ES256", headers={"kid": _TEST_KID})
