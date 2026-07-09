# Agency Batch Campaign Generator — Backend Core Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend pipeline that turns a per-client brief into an approved, launched Google Ads + Meta Ads campaign — brief intake, LLM generation, platform adapters, guardrails, human approval, and batched push — as a tested API with no frontend.

**Architecture:** A FastAPI service backed by Supabase-hosted Postgres (SQLAlchemy 2.0 models, portable to SQLite for tests), with agency login handled by Supabase Auth (the frontend authenticates directly against Supabase; this backend only verifies the resulting token), OAuth-connected per-client Google Ads / Meta credentials stored encrypted at rest, an Anthropic-backed generation service, per-platform adapter and push modules behind small injectable "port" interfaces (real SDK-backed implementation + fake for tests), and an RQ/Redis job queue for the batch push step so publishing doesn't block the request thread.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2, `psycopg`, Supabase (Postgres hosting + Auth), `pyjwt` (verifying Supabase-issued tokens), `cryptography` (token encryption), `httpx` (OAuth token exchange), `anthropic` SDK (model id `claude-sonnet-5`), `google-ads` SDK, `facebook-business` SDK, `rq` + Redis, `pytest`.

This is **Plan 1 of 2** (see `docs/superpowers/specs/2026-07-07-agency-batch-campaign-generator-design.md`). Plan 2 (frontend: brief intake UI, approval screen, client OAuth connect UI) is written separately once this backend is reviewed and working.

## Global Constraints

- Python 3.12; all new code lives under `backend/app/`.
- SQLAlchemy 2.0 declarative style (`Mapped`/`mapped_column`), using `sqlalchemy.Uuid` and `sqlalchemy.JSON` column types so the same models work against Postgres (production, hosted on Supabase) and SQLite in-memory (tests) without divergence.
- No migration tool (Alembic) in this plan — tables are created via `Base.metadata.create_all()` at app startup (Task 1), which is sufficient for a hand-onboarded pilot with one deploy target. Revisit if/when schema changes need to run against a populated production database without data loss.
- Pydantic v2 for all request/response schemas and settings (`pydantic-settings`).
- **Agency login is handled entirely by Supabase Auth, not by this backend.** The frontend (Plan 2) signs an agency user in directly against Supabase and gets back a Supabase-issued JWT; this backend never sees a password and never issues its own login tokens — it only verifies the Supabase JWT on incoming requests (see Task 3). There is still no public signup: a pilot agency is onboarded by creating their user in the Supabase dashboard by hand, then running `backend/scripts/link_agency.py` to connect that Supabase user to a local `Agency` row.
- All OAuth refresh/access tokens are encrypted at rest via `cryptography.fernet.Fernet` before being written to the database; the encryption key comes from `TOKEN_ENCRYPTION_KEY` and is never logged.
- Every external network call (Google/Meta OAuth token exchange, Anthropic, Google Ads API, Meta Marketing API) goes through an injectable client so unit tests run with no network access and no real credentials.
- Every task ends with `pytest` green before its commit.
- LLM model id: `claude-sonnet-5` (Claude Sonnet 5), called via the `anthropic` Python SDK.

---

## File Structure

```
backend/
  requirements.txt
  app/
    __init__.py
    main.py
    config.py
    db.py
    security.py            # Supabase JWT verification
    encryption.py           # Fernet token encrypt/decrypt
    models/                 # one file per entity
    schemas/                 # Pydantic request/response + CampaignIR
    routers/                  # FastAPI routers
    services/                  # generation, adapters, guardrails, oauth, audit
    workers/                    # RQ queue + push jobs
  scripts/link_agency.py
  tests/
```

---

### Task 1: Project scaffolding & test harness

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/db.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Produces: `app.config.get_settings() -> Settings`, `app.db.Base` (declarative base), `app.db.make_engine(url: str | None) -> Engine`, `app.db.get_db()` (FastAPI dependency yielding a `Session`), `app.main.app` (the FastAPI instance), test fixture `client` (a `fastapi.testclient.TestClient`).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_health.py
def test_health_returns_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_health.py -v`
Expected: FAIL (collection error — `app.main` doesn't exist yet)

- [ ] **Step 3: Write the scaffolding**

```text
# backend/requirements.txt
fastapi>=0.115
uvicorn[standard]>=0.30
sqlalchemy>=2.0.25
pydantic>=2.8
pydantic-settings>=2.4
psycopg[binary]>=3.2
pyjwt>=2.9
cryptography>=43.0
httpx>=0.27
httpx2>=2.0  # required by starlette's TestClient in recent fastapi/starlette versions
anthropic>=0.34
google-ads>=25.0.0
facebook-business>=21.0.0
rq>=1.16
redis>=5.0
pytest>=8.3
pytest-cov>=5.0
```

```python
# backend/app/config.py
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./dev.db"  # local dev/tests; set to the Supabase Postgres connection string in deployment
    supabase_jwt_secret: str = "dev-secret-change-me-32-bytes-min"  # from Supabase project settings > API > JWT Secret
    token_encryption_key: str = ""
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5"
    google_ads_developer_token: str = ""
    google_ads_client_id: str = ""
    google_ads_client_secret: str = ""
    google_ads_oauth_redirect_uri: str = "http://localhost:8000/clients/google/oauth/callback"
    meta_app_id: str = ""
    meta_app_secret: str = ""
    meta_oauth_redirect_uri: str = "http://localhost:8000/clients/meta/oauth/callback"
    redis_url: str = "redis://localhost:6379/0"


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

```python
# backend/app/db.py
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def make_engine(database_url: str | None = None):
    url = database_url or get_settings().database_url
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args)


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

```python
# backend/app/main.py
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import Base, engine


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Creates any tables declared on Base.metadata that don't exist yet. Safe to run on
    # every startup — no-op for tables that already exist. Sufficient for a hand-onboarded
    # pilot with a single deploy target; see Global Constraints for when to add real migrations.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Agency Batch Campaign Generator", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

Uses the `lifespan` context manager rather than the older `@app.on_event("startup")` decorator, which recent FastAPI/Starlette versions flag as deprecated.

```python
# backend/tests/conftest.py
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_health.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/app backend/tests
git commit -m "chore: scaffold FastAPI backend with health check"
```

---

### Task 2: Core data models (Agency, Client, BrandVoiceProfile, AuditLog)

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/agency.py`
- Create: `backend/app/models/client.py`
- Create: `backend/app/models/brand_voice.py`
- Create: `backend/app/models/audit.py`
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/audit.py`
- Modify: `backend/tests/conftest.py` (add `db_session` fixture)
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Consumes: `app.db.Base`, `app.db.SessionLocal` from Task 1.
- Produces: models `Agency`, `Client`, `BrandVoiceProfile`, `AuditLog` (all with `id: uuid.UUID` primary keys); `app.services.audit.record_audit_event(db: Session, *, agency_id: uuid.UUID, event_type: str, payload: dict, client_id: uuid.UUID | None = None) -> AuditLog`. Test fixture `db_session` (an in-memory-SQLite `Session` with all tables created).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_models.py
import uuid

from app.models.agency import Agency
from app.models.client import Client
from app.models.brand_voice import BrandVoiceProfile
from app.services.audit import record_audit_event


def test_create_agency_client_and_brand_voice(db_session):
    agency = Agency(name="Acme Agency", email="owner@acme.test", supabase_user_id="sb-user-1")
    db_session.add(agency)
    db_session.flush()

    client = Client(agency_id=agency.id, name="Client A")
    db_session.add(client)
    db_session.flush()

    profile = BrandVoiceProfile(
        client_id=client.id,
        tone="friendly, expert",
        banned_terms=["cheap", "guaranteed"],
        required_disclaimers=["Results vary."],
        approved_offers=["10% off first order"],
    )
    db_session.add(profile)
    db_session.commit()

    fetched = db_session.get(Client, client.id)
    assert fetched.agency_id == agency.id
    assert fetched.brand_voice_profile.tone == "friendly, expert"
    assert "cheap" in fetched.brand_voice_profile.banned_terms


def test_record_audit_event_persists(db_session):
    agency = Agency(name="Acme Agency", email="owner2@acme.test", supabase_user_id="sb-user-2")
    db_session.add(agency)
    db_session.flush()

    entry = record_audit_event(
        db_session,
        agency_id=agency.id,
        event_type="brief.submitted",
        payload={"note": "first brief"},
    )

    assert isinstance(entry.id, uuid.UUID)
    assert entry.event_type == "brief.submitted"
    assert entry.payload["note"] == "first brief"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_models.py -v`
Expected: FAIL (`ModuleNotFoundError: app.models.agency`)

- [ ] **Step 3: Write the models and audit helper**

```python
# backend/app/models/agency.py
import uuid
from datetime import datetime, timezone

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Agency(Base):
    __tablename__ = "agencies"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    supabase_user_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    clients: Mapped[list["Client"]] = relationship(back_populates="agency")
```

`supabase_user_id` is the link to Supabase Auth: it stores the `sub` claim from that agency's Supabase-issued JWT, and is how `get_current_agency` (Task 3) resolves an incoming request to a local `Agency` row. Credentials themselves (password, etc.) live in Supabase, not in this table.

```python
# backend/app/models/client.py
import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id"))
    name: Mapped[str] = mapped_column(String(255))

    google_ads_customer_id: Mapped[str | None] = mapped_column(String(32), default=None)
    google_refresh_token_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, default=None)

    meta_ad_account_id: Mapped[str | None] = mapped_column(String(64), default=None)
    meta_access_token_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, default=None)

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    agency: Mapped["Agency"] = relationship(back_populates="clients")
    brand_voice_profile: Mapped["BrandVoiceProfile"] = relationship(
        back_populates="client", uselist=False
    )
```

```python
# backend/app/models/brand_voice.py
import uuid

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class BrandVoiceProfile(Base):
    __tablename__ = "brand_voice_profiles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id"), unique=True)
    tone: Mapped[str] = mapped_column(String(500))
    banned_terms: Mapped[list[str]] = mapped_column(JSON, default=list)
    required_disclaimers: Mapped[list[str]] = mapped_column(JSON, default=list)
    approved_offers: Mapped[list[str]] = mapped_column(JSON, default=list)

    client: Mapped["Client"] = relationship(back_populates="brand_voice_profile")
```

```python
# backend/app/models/audit.py
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id"))
    client_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("clients.id"), default=None)
    event_type: Mapped[str] = mapped_column(String(100))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
```

```python
# backend/app/models/__init__.py
from app.models.agency import Agency
from app.models.client import Client
from app.models.brand_voice import BrandVoiceProfile
from app.models.audit import AuditLog

__all__ = ["Agency", "Client", "BrandVoiceProfile", "AuditLog"]
```

```python
# backend/app/services/audit.py
import uuid

from sqlalchemy.orm import Session

from app.models.audit import AuditLog


def record_audit_event(
    db: Session,
    *,
    agency_id: uuid.UUID,
    event_type: str,
    payload: dict,
    client_id: uuid.UUID | None = None,
) -> AuditLog:
    entry = AuditLog(
        agency_id=agency_id,
        client_id=client_id,
        event_type=event_type,
        payload=payload,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
```

```python
# backend/tests/conftest.py (append to existing file from Task 1)
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401  ensures all models are registered on Base
from app.db import Base


@pytest.fixture()
def db_session() -> Session:
    # StaticPool forces every connection checkout to reuse the same underlying
    # connection — without it, SQLite's `:memory:` database is per-connection, so a
    # session that commits and a session that later queries can land on two separate,
    # independently-empty in-memory databases (this bites as soon as a route handler's
    # `get_db` override reads back something a test wrote via `db_session`).
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models backend/app/services/audit.py backend/app/services/__init__.py backend/tests
git commit -m "feat: add Agency/Client/BrandVoiceProfile/AuditLog models and audit helper"
```

---

### Task 3: Agency auth via Supabase (JWT verification + hand-onboarding link script)

Login itself does **not** happen in this backend — the frontend (Plan 2) authenticates the agency user directly against Supabase Auth and receives a Supabase-issued JWT. This backend's only job is to verify that JWT on incoming requests and resolve it to a local `Agency` row.

**Files:**
- Create: `backend/app/security.py`
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/schemas/agency.py`
- Create: `backend/app/routers/__init__.py`
- Create: `backend/app/routers/me.py`
- Create: `backend/scripts/link_agency.py`
- Modify: `backend/tests/conftest.py` (add `make_supabase_jwt` test helper)
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `Agency` model (Task 2, with `supabase_user_id`), `get_db` (Task 1).
- Produces: `app.security.get_current_agency(...) -> Agency` (FastAPI dependency — every later task's protected routes depend on this); route `GET /me`; test helper `make_supabase_jwt(supabase_user_id: str) -> str` in `tests/conftest.py`, which every later task's tests import in place of the old `create_access_token` to build `Authorization: Bearer <token>` headers.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_auth.py
from app.models.agency import Agency
from tests.conftest import make_supabase_jwt


def test_me_returns_agency_for_valid_supabase_token(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session

    agency = Agency(supabase_user_id="sb-user-42", name="Acme Agency", email="owner@acme.test")
    db_session.add(agency)
    db_session.commit()

    token = make_supabase_jwt("sb-user-42")
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["email"] == "owner@acme.test"

    main.app.dependency_overrides.clear()


def test_me_rejects_token_with_no_linked_agency(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session

    token = make_supabase_jwt("sb-user-unlinked")
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401

    main.app.dependency_overrides.clear()


def test_me_rejects_invalid_token(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session

    response = client.get("/me", headers={"Authorization": "Bearer not-a-real-token"})

    assert response.status_code == 401

    main.app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_auth.py -v`
Expected: FAIL (`ImportError: cannot import name 'make_supabase_jwt' from 'tests.conftest'`)

- [ ] **Step 3: Write the JWT verification, `/me` route, and link script**

```python
# backend/app/security.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWTError, decode
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models.agency import Agency

_bearer = HTTPBearer()


def get_current_agency(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Agency:
    settings = get_settings()
    try:
        payload = decode(
            credentials.credentials,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
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
```

```python
# backend/app/schemas/agency.py
import uuid

from pydantic import BaseModel


class AgencyResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str

    model_config = {"from_attributes": True}
```

```python
# backend/app/routers/me.py
from fastapi import APIRouter, Depends

from app.models.agency import Agency
from app.schemas.agency import AgencyResponse
from app.security import get_current_agency

router = APIRouter(tags=["me"])


@router.get("/me", response_model=AgencyResponse)
def read_current_agency(agency: Agency = Depends(get_current_agency)) -> Agency:
    return agency
```

```python
# backend/scripts/link_agency.py
"""
Hand-onboard a pilot agency onto Supabase Auth:
1. Create the agency's user in the Supabase dashboard (Authentication > Users > Add user).
2. Copy that user's UID from the dashboard.
3. Run: python scripts/link_agency.py --supabase-user-id <uid> --name "Acme" --email owner@acme.test
"""
import argparse

from app.db import SessionLocal
from app.models.agency import Agency


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--supabase-user-id", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--email", required=True)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        agency = Agency(supabase_user_id=args.supabase_user_id, name=args.name, email=args.email)
        db.add(agency)
        db.commit()
        print(f"Linked agency {agency.id} to Supabase user {args.supabase_user_id}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

```python
# backend/tests/conftest.py (append to existing file from Tasks 1-2)
import jwt as pyjwt


def make_supabase_jwt(supabase_user_id: str) -> str:
    """Mints a JWT shaped like one Supabase Auth would issue, signed with the same
    shared secret get_current_agency verifies against. Test-only — real tokens are
    always minted by Supabase itself, never by this backend."""
    from app.config import get_settings

    settings = get_settings()
    payload = {"sub": supabase_user_id, "aud": "authenticated", "email": f"{supabase_user_id}@test.supabase"}
    return pyjwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")
```

```python
# backend/app/main.py (full file, replaces Task 1 version)
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import Base, engine, get_db  # get_db re-exported for dependency_overrides in tests
from app.routers import me


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Agency Batch Campaign Generator", lifespan=lifespan)
app.include_router(me.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_auth.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/security.py backend/app/schemas backend/app/routers backend/app/main.py backend/scripts backend/tests
git commit -m "feat: verify Supabase-issued JWTs and add hand-onboarding link script"
```

---

### Task 4: Client CRUD + Google Ads OAuth connect flow

> **Platform approval note:** this connect flow works end-to-end for any account added as a tester/admin on our Google Ads manager account, but Google's own review (developer token tier + OAuth sensitive-scope verification, 10+ days) gates connecting an outside pilot agency's *independent* ad account. Start that review in parallel with this task, not after — see the design spec's "Platform approval requirements" section. Does not block building or testing this task with sandbox/test accounts.

**Files:**
- Create: `backend/app/encryption.py`
- Create: `backend/app/schemas/client.py`
- Create: `backend/app/services/google_oauth.py`
- Create: `backend/app/routers/clients.py`
- Modify: `backend/app/main.py` (include `clients` router)
- Test: `backend/tests/test_encryption.py`
- Test: `backend/tests/test_google_oauth.py`

**Interfaces:**
- Consumes: `get_current_agency` (Task 3), `Client` model (Task 2).
- Produces: `app.encryption.encrypt_token(raw: str) -> bytes`, `app.encryption.decrypt_token(blob: bytes) -> str`; `app.services.google_oauth.build_authorize_url(state: str) -> str`, `app.services.google_oauth.exchange_code_for_tokens(code: str, http_client: httpx.Client) -> GoogleTokenResponse` (with `.refresh_token: str`); routes `POST /clients` (create), `GET /clients/{client_id}/google/oauth/start`, `GET /clients/{client_id}/google/oauth/callback`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_encryption.py
from app.encryption import decrypt_token, encrypt_token


def test_encrypt_decrypt_round_trip(monkeypatch):
    from cryptography.fernet import Fernet

    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    from app.config import get_settings

    get_settings.cache_clear()

    blob = encrypt_token("refresh-token-value")
    assert blob != b"refresh-token-value"
    assert decrypt_token(blob) == "refresh-token-value"

    get_settings.cache_clear()
```

```python
# backend/tests/test_google_oauth.py
import httpx

from app.services.google_oauth import build_authorize_url, exchange_code_for_tokens


def test_build_authorize_url_includes_scope_and_state():
    url = build_authorize_url(state="abc123")
    assert "state=abc123" in url
    assert "adwords" in url


def test_exchange_code_for_tokens_parses_response():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/token"
        return httpx.Response(200, json={"refresh_token": "rt-1", "access_token": "at-1"})

    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    result = exchange_code_for_tokens("auth-code", http_client=http_client)

    assert result.refresh_token == "rt-1"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_encryption.py tests/test_google_oauth.py -v`
Expected: FAIL (`ModuleNotFoundError: app.encryption`)

- [ ] **Step 3: Write encryption, Google OAuth service, and client routes**

```python
# backend/app/encryption.py
from cryptography.fernet import Fernet

from app.config import get_settings


def _fernet() -> Fernet:
    key = get_settings().token_encryption_key
    if not key:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY is not configured")
    return Fernet(key.encode())


def encrypt_token(raw: str) -> bytes:
    return _fernet().encrypt(raw.encode())


def decrypt_token(blob: bytes) -> str:
    return _fernet().decrypt(blob).decode()
```

```python
# backend/app/services/google_oauth.py
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
```

```python
# backend/app/schemas/client.py
import uuid

from pydantic import BaseModel


class ClientCreateRequest(BaseModel):
    name: str


class ClientResponse(BaseModel):
    id: uuid.UUID
    name: str
    google_ads_customer_id: str | None
    meta_ad_account_id: str | None

    model_config = {"from_attributes": True}
```

```python
# backend/app/routers/clients.py
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.encryption import encrypt_token
from app.models.agency import Agency
from app.models.client import Client
from app.schemas.client import ClientCreateRequest, ClientResponse
from app.security import get_current_agency
from app.services.audit import record_audit_event
from app.services.google_oauth import build_authorize_url, exchange_code_for_tokens

router = APIRouter(prefix="/clients", tags=["clients"])


@router.post("", response_model=ClientResponse)
def create_client(
    body: ClientCreateRequest,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> Client:
    client = Client(agency_id=agency.id, name=body.name)
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.get("/{client_id}/google/oauth/start")
def google_oauth_start(
    client_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> RedirectResponse:
    client = db.get(Client, client_id)
    if client is None or client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Client not found")
    return RedirectResponse(build_authorize_url(state=str(client_id)))


@router.get("/{client_id}/google/oauth/callback")
def google_oauth_callback(
    client_id: uuid.UUID,
    code: str,
    request: Request,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> dict[str, str]:
    client = db.get(Client, client_id)
    if client is None or client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Client not found")

    tokens = exchange_code_for_tokens(code, http_client=httpx.Client())
    client.google_refresh_token_encrypted = encrypt_token(tokens.refresh_token)
    db.commit()

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=client.id,
        event_type="client.google_connected",
        payload={},
    )
    return {"status": "connected"}
```

```python
# backend/app/main.py (add to imports and includes)
from app.routers import clients, me

app.include_router(clients.router)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_encryption.py tests/test_google_oauth.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/encryption.py backend/app/services/google_oauth.py backend/app/schemas/client.py backend/app/routers/clients.py backend/app/main.py backend/tests/test_encryption.py backend/tests/test_google_oauth.py
git commit -m "feat: add client creation and Google Ads OAuth connect flow"
```

---

### Task 5: Meta Ads OAuth connect flow

> **Platform approval note:** same caveat as Task 4, for Meta. This connect flow works for accounts added as testers/admins on our Meta Business Manager, but onboarding an outside pilot agency's *independent* ad account is gated on Meta App Review (Advanced Access to `ads_management`) **and** a separate Business Verification step — both take real time (unconfirmed by Meta, third-party estimates ~1-4 weeks combined) and should start now, in parallel with the build. See the design spec's "Platform approval requirements" section for sourcing. Does not block building or testing this task with sandbox accounts.

**Files:**
- Create: `backend/app/services/meta_oauth.py`
- Modify: `backend/app/routers/clients.py` (add Meta OAuth routes)
- Test: `backend/tests/test_meta_oauth.py`

**Interfaces:**
- Consumes: `app.encryption.encrypt_token` (Task 4), `record_audit_event` (Task 2).
- Produces: `app.services.meta_oauth.build_authorize_url(state: str) -> str`, `app.services.meta_oauth.exchange_code_for_tokens(code: str, http_client: httpx.Client) -> MetaTokenResponse` (with `.access_token: str`); routes `GET /clients/{client_id}/meta/oauth/start`, `GET /clients/{client_id}/meta/oauth/callback`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_meta_oauth.py
import httpx

from app.services.meta_oauth import build_authorize_url, exchange_code_for_tokens


def test_build_authorize_url_includes_scope_and_state():
    url = build_authorize_url(state="xyz789")
    assert "state=xyz789" in url
    assert "ads_management" in url


def test_exchange_code_for_tokens_parses_response():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/oauth/access_token")
        return httpx.Response(200, json={"access_token": "meta-at-1", "token_type": "bearer"})

    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    result = exchange_code_for_tokens("auth-code", http_client=http_client)

    assert result.access_token == "meta-at-1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_meta_oauth.py -v`
Expected: FAIL (`ModuleNotFoundError: app.services.meta_oauth`)

- [ ] **Step 3: Write the Meta OAuth service and routes**

```python
# backend/app/services/meta_oauth.py
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
```

```python
# backend/app/routers/clients.py (append to existing file)
from app.services import meta_oauth


@router.get("/{client_id}/meta/oauth/start")
def meta_oauth_start(
    client_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> RedirectResponse:
    client = db.get(Client, client_id)
    if client is None or client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Client not found")
    return RedirectResponse(meta_oauth.build_authorize_url(state=str(client_id)))


@router.get("/{client_id}/meta/oauth/callback")
def meta_oauth_callback(
    client_id: uuid.UUID,
    code: str,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> dict[str, str]:
    client = db.get(Client, client_id)
    if client is None or client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Client not found")

    tokens = meta_oauth.exchange_code_for_tokens(code, http_client=httpx.Client())
    client.meta_access_token_encrypted = encrypt_token(tokens.access_token)
    db.commit()

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=client.id,
        event_type="client.meta_connected",
        payload={},
    )
    return {"status": "connected"}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_meta_oauth.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/meta_oauth.py backend/app/routers/clients.py backend/tests/test_meta_oauth.py
git commit -m "feat: add Meta Ads OAuth connect flow"
```

---

### Task 6: Brief intake (single + batch) and CampaignDraft model

**Files:**
- Create: `backend/app/models/brief.py`
- Create: `backend/app/schemas/brief.py`
- Create: `backend/app/routers/briefs.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_briefs.py`

**Interfaces:**
- Consumes: `Client`, `get_current_agency`, `record_audit_event`.
- Produces: models `Brief` (with a `client` relationship back to `Client`, used by every later task as `draft.brief.client`), `CampaignDraft` (with `status: str`, one-to-one on `brief_id`); routes `POST /briefs` (single), `POST /briefs/batch` (list of `{client_id, business_description, budget_usd, goals}`), each creates a `Brief` + an empty `CampaignDraft` row with `status="pending_generation"`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_briefs.py
from app.models.agency import Agency
from app.models.client import Client
from tests.conftest import make_supabase_jwt


def _agency_and_headers(db_session):
    agency = Agency(supabase_user_id="sb-briefs-1", name="Acme", email="briefs@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_a = Client(agency_id=agency.id, name="Client A")
    client_b = Client(agency_id=agency.id, name="Client B")
    db_session.add_all([client_a, client_b])
    db_session.commit()
    token = make_supabase_jwt(agency.supabase_user_id)
    return agency, client_a, client_b, {"Authorization": f"Bearer {token}"}


def test_submit_single_brief_creates_pending_draft(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, client_a, _, headers = _agency_and_headers(db_session)

    response = client.post(
        "/briefs",
        json={
            "client_id": str(client_a.id),
            "business_description": "Local bakery in Austin",
            "budget_usd": 500,
            "goals": "Drive foot traffic",
        },
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending_generation"

    main.app.dependency_overrides.clear()


def test_submit_batch_briefs_creates_one_draft_per_client(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, client_a, client_b, headers = _agency_and_headers(db_session)

    response = client.post(
        "/briefs/batch",
        json={
            "briefs": [
                {
                    "client_id": str(client_a.id),
                    "business_description": "Bakery",
                    "budget_usd": 500,
                    "goals": "Foot traffic",
                },
                {
                    "client_id": str(client_b.id),
                    "business_description": "Plumber",
                    "budget_usd": 800,
                    "goals": "Emergency calls",
                },
            ]
        },
        headers=headers,
    )

    assert response.status_code == 201
    assert len(response.json()) == 2

    main.app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_briefs.py -v`
Expected: FAIL (`ModuleNotFoundError: app.models.brief`)

- [ ] **Step 3: Write the models, schemas, and router**

```python
# backend/app/models/brief.py
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, ForeignKey, Float, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Brief(Base):
    __tablename__ = "briefs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id"))
    business_description: Mapped[str] = mapped_column(String(2000))
    budget_usd: Mapped[float] = mapped_column(Float)
    goals: Mapped[str] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    client: Mapped["Client"] = relationship()
    draft: Mapped["CampaignDraft"] = relationship(back_populates="brief", uselist=False)


class CampaignDraft(Base):
    __tablename__ = "campaign_drafts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    brief_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("briefs.id"), unique=True)
    status: Mapped[str] = mapped_column(String(30), default="pending_generation")
    ir_json: Mapped[dict | None] = mapped_column(JSON, default=None)
    google_plan_json: Mapped[dict | None] = mapped_column(JSON, default=None)
    meta_plan_json: Mapped[dict | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    brief: Mapped["Brief"] = relationship(back_populates="draft")
```

```python
# backend/app/models/__init__.py (replace)
from app.models.agency import Agency
from app.models.client import Client
from app.models.brand_voice import BrandVoiceProfile
from app.models.audit import AuditLog
from app.models.brief import Brief, CampaignDraft

__all__ = ["Agency", "Client", "BrandVoiceProfile", "AuditLog", "Brief", "CampaignDraft"]
```

```python
# backend/app/schemas/brief.py
import uuid

from pydantic import BaseModel


class BriefCreateRequest(BaseModel):
    client_id: uuid.UUID
    business_description: str
    budget_usd: float
    goals: str


class BriefBatchCreateRequest(BaseModel):
    briefs: list[BriefCreateRequest]


class CampaignDraftResponse(BaseModel):
    id: uuid.UUID
    brief_id: uuid.UUID
    status: str

    model_config = {"from_attributes": True}
```

```python
# backend/app/routers/briefs.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.schemas.brief import BriefBatchCreateRequest, BriefCreateRequest, CampaignDraftResponse
from app.security import get_current_agency
from app.services.audit import record_audit_event

router = APIRouter(prefix="/briefs", tags=["briefs"])


def _create_one(body: BriefCreateRequest, db: Session, agency: Agency) -> CampaignDraft:
    client = db.get(Client, body.client_id)
    if client is None or client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail=f"Client {body.client_id} not found")

    brief = Brief(
        client_id=client.id,
        business_description=body.business_description,
        budget_usd=body.budget_usd,
        goals=body.goals,
    )
    db.add(brief)
    db.flush()

    draft = CampaignDraft(brief_id=brief.id)
    db.add(draft)
    db.commit()
    db.refresh(draft)

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=client.id,
        event_type="brief.submitted",
        payload={"brief_id": str(brief.id)},
    )
    return draft


@router.post("", response_model=CampaignDraftResponse, status_code=status.HTTP_201_CREATED)
def submit_brief(
    body: BriefCreateRequest,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> CampaignDraft:
    return _create_one(body, db, agency)


@router.post("/batch", response_model=list[CampaignDraftResponse], status_code=status.HTTP_201_CREATED)
def submit_briefs_batch(
    body: BriefBatchCreateRequest,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> list[CampaignDraft]:
    return [_create_one(b, db, agency) for b in body.briefs]
```

```python
# backend/app/main.py (add to imports and includes)
from app.routers import briefs, clients, me

app.include_router(briefs.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_briefs.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models backend/app/schemas/brief.py backend/app/routers/briefs.py backend/app/main.py backend/tests/test_briefs.py
git commit -m "feat: add brief intake (single + batch) and CampaignDraft model"
```

---

### Task 7: LLM campaign draft generation (Claude)

**Files:**
- Create: `backend/app/schemas/campaign_ir.py`
- Create: `backend/app/services/llm_generation.py`
- Create: `backend/app/routers/generation.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_llm_generation.py`

**Interfaces:**
- Consumes: `CampaignDraft`, `BrandVoiceProfile`, `Brief`.
- Produces: `app.schemas.campaign_ir.CampaignIR` (fields: `campaign_name: str`, `objective: Literal["leads","sales","traffic","awareness"]`, `daily_budget_usd: float`, `end_date: date | None`, `keywords: list[str]`, `audience_description: str`, `ad_copy: list[AdCopyVariant]` where `AdCopyVariant` has `headline: str, description: str`, `call_to_action: str`); `app.services.llm_generation.generate_campaign_ir(brief: Brief, brand_voice: BrandVoiceProfile | None, anthropic_client) -> CampaignIR`; route `POST /briefs/{draft_id}/generate` which calls the service and stores `ir_json`, sets `status="generated"`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_llm_generation.py
import json
from types import SimpleNamespace

from app.models.brief import Brief
from app.models.brand_voice import BrandVoiceProfile
from app.services.llm_generation import generate_campaign_ir


class FakeAnthropicClient:
    def __init__(self, response_text: str):
        self._response_text = response_text
        self.last_prompt = None

    class _Messages:
        def __init__(self, outer):
            self._outer = outer

        def create(self, **kwargs):
            self._outer.last_prompt = kwargs
            return SimpleNamespace(content=[SimpleNamespace(text=self._outer._response_text)])

    @property
    def messages(self):
        return FakeAnthropicClient._Messages(self)


def test_generate_campaign_ir_parses_model_output():
    brief = Brief(
        client_id=None,
        business_description="Local bakery in Austin",
        budget_usd=500,
        goals="Drive foot traffic",
    )
    brand_voice = BrandVoiceProfile(
        client_id=None,
        tone="warm, community-focused",
        banned_terms=["cheap"],
        required_disclaimers=[],
        approved_offers=["Free coffee with pastry purchase"],
    )
    fake_response = json.dumps(
        {
            "campaign_name": "Austin Bakery Foot Traffic",
            "objective": "traffic",
            "daily_budget_usd": 16.5,
            "end_date": None,
            "keywords": ["bakery near me", "austin pastries"],
            "audience_description": "Adults 25-54 within 5 miles of Austin bakery",
            "ad_copy": [
                {"headline": "Fresh Pastries Daily", "description": "Visit our Austin bakery today."}
            ],
            "call_to_action": "Visit Us Today",
        }
    )
    fake_client = FakeAnthropicClient(fake_response)

    ir = generate_campaign_ir(brief, brand_voice, anthropic_client=fake_client)

    assert ir.campaign_name == "Austin Bakery Foot Traffic"
    assert ir.keywords == ["bakery near me", "austin pastries"]
    assert "cheap" in fake_client.last_prompt["messages"][0]["content"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_llm_generation.py -v`
Expected: FAIL (`ModuleNotFoundError: app.services.llm_generation`)

- [ ] **Step 3: Write the CampaignIR schema and generation service**

```python
# backend/app/schemas/campaign_ir.py
from datetime import date
from typing import Literal

from pydantic import BaseModel


class AdCopyVariant(BaseModel):
    headline: str
    description: str


class CampaignIR(BaseModel):
    campaign_name: str
    objective: Literal["leads", "sales", "traffic", "awareness"]
    daily_budget_usd: float
    end_date: date | None = None
    keywords: list[str]
    audience_description: str
    ad_copy: list[AdCopyVariant]
    call_to_action: str
```

```python
# backend/app/services/llm_generation.py
from app.config import get_settings
from app.models.brand_voice import BrandVoiceProfile
from app.models.brief import Brief
from app.schemas.campaign_ir import CampaignIR

_SYSTEM_PROMPT = (
    "You generate a single Google/Meta ad campaign as strict JSON matching the given schema. "
    "Never use banned terms. Respect the required tone. Output JSON only, no prose."
)


def _build_prompt(brief: Brief, brand_voice: BrandVoiceProfile | None) -> str:
    banned = ", ".join(brand_voice.banned_terms) if brand_voice else "(none)"
    tone = brand_voice.tone if brand_voice else "neutral, professional"
    disclaimers = ", ".join(brand_voice.required_disclaimers) if brand_voice else "(none)"
    offers = ", ".join(brand_voice.approved_offers) if brand_voice else "(none)"
    return (
        f"Business description: {brief.business_description}\n"
        f"Daily/total budget in USD: {brief.budget_usd}\n"
        f"Goals: {brief.goals}\n"
        f"Required tone: {tone}\n"
        f"Banned terms (never use): {banned}\n"
        f"Required disclaimers: {disclaimers}\n"
        f"Currently approved offers: {offers}\n"
        "Return JSON with keys: campaign_name, objective (one of leads/sales/traffic/awareness), "
        "daily_budget_usd, end_date (YYYY-MM-DD or null), keywords (list of strings), "
        "audience_description, ad_copy (list of {headline, description}), call_to_action."
    )


def generate_campaign_ir(
    brief: Brief, brand_voice: BrandVoiceProfile | None, anthropic_client
) -> CampaignIR:
    settings = get_settings()
    prompt = _build_prompt(brief, brand_voice)
    response = anthropic_client.messages.create(
        model=settings.anthropic_model,
        max_tokens=1024,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    raw_text = response.content[0].text
    return CampaignIR.model_validate_json(raw_text)
```

```python
# backend/app/routers/generation.py
import uuid

from anthropic import Anthropic
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models.agency import Agency
from app.models.brief import CampaignDraft
from app.security import get_current_agency
from app.services.audit import record_audit_event
from app.services.llm_generation import generate_campaign_ir

router = APIRouter(prefix="/briefs", tags=["generation"])


@router.post("/{draft_id}/generate")
def generate_draft(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> dict[str, str]:
    draft = db.get(CampaignDraft, draft_id)
    if draft is None or draft.brief.client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Draft not found")

    client = Anthropic(api_key=get_settings().anthropic_api_key)
    ir = generate_campaign_ir(draft.brief, draft.brief.client.brand_voice_profile, anthropic_client=client)

    draft.ir_json = ir.model_dump(mode="json")
    draft.status = "generated"
    db.commit()

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=draft.brief.client_id,
        event_type="draft.generated",
        payload={"draft_id": str(draft.id)},
    )
    return {"status": draft.status}
```

```python
# backend/app/main.py (add to imports and includes)
from app.routers import briefs, clients, generation, me

app.include_router(generation.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_llm_generation.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/campaign_ir.py backend/app/services/llm_generation.py backend/app/routers/generation.py backend/app/main.py backend/tests/test_llm_generation.py
git commit -m "feat: add Claude-backed campaign IR generation"
```

---

### Task 8: Google Ads platform adapter

**Files:**
- Create: `backend/app/schemas/google_plan.py`
- Create: `backend/app/services/google_adapter.py`
- Modify: `backend/app/routers/generation.py` (call adapter after IR generation)
- Test: `backend/tests/test_google_adapter.py`

**Interfaces:**
- Consumes: `CampaignIR` (Task 7).
- Produces: `app.schemas.google_plan.GoogleCampaignPlan` (`campaign_name: str`, `daily_budget_micros: int`, `end_date: date | None`, `ad_groups: list[GoogleAdGroup]` where `GoogleAdGroup` has `name: str, keywords: list[str], headlines: list[str], descriptions: list[str]`); `app.services.google_adapter.adapt_to_google(ir: CampaignIR) -> GoogleCampaignPlan`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_google_adapter.py
from app.schemas.campaign_ir import AdCopyVariant, CampaignIR
from app.services.google_adapter import adapt_to_google


def test_adapt_to_google_converts_budget_and_groups_keywords():
    ir = CampaignIR(
        campaign_name="Austin Bakery Foot Traffic",
        objective="traffic",
        daily_budget_usd=16.5,
        keywords=["bakery near me", "austin pastries"],
        audience_description="Adults 25-54 near Austin",
        ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
        call_to_action="Visit Us Today",
    )

    plan = adapt_to_google(ir)

    assert plan.campaign_name == "Austin Bakery Foot Traffic"
    assert plan.daily_budget_micros == 16_500_000
    assert len(plan.ad_groups) == 1
    assert plan.ad_groups[0].keywords == ["bakery near me", "austin pastries"]
    assert "Fresh Pastries Daily" in plan.ad_groups[0].headlines
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_google_adapter.py -v`
Expected: FAIL (`ModuleNotFoundError: app.services.google_adapter`)

- [ ] **Step 3: Write the schema and adapter**

```python
# backend/app/schemas/google_plan.py
from datetime import date

from pydantic import BaseModel


class GoogleAdGroup(BaseModel):
    name: str
    keywords: list[str]
    headlines: list[str]
    descriptions: list[str]


class GoogleCampaignPlan(BaseModel):
    campaign_name: str
    daily_budget_micros: int
    end_date: date | None = None
    ad_groups: list[GoogleAdGroup]
```

```python
# backend/app/services/google_adapter.py
from app.schemas.campaign_ir import CampaignIR
from app.schemas.google_plan import GoogleAdGroup, GoogleCampaignPlan


def adapt_to_google(ir: CampaignIR) -> GoogleCampaignPlan:
    ad_group = GoogleAdGroup(
        name=f"{ir.campaign_name} - Primary",
        keywords=list(ir.keywords),
        headlines=[variant.headline for variant in ir.ad_copy],
        descriptions=[variant.description for variant in ir.ad_copy],
    )
    return GoogleCampaignPlan(
        campaign_name=ir.campaign_name,
        daily_budget_micros=round(ir.daily_budget_usd * 1_000_000),
        end_date=ir.end_date,
        ad_groups=[ad_group],
    )
```

```python
# backend/app/routers/generation.py (modify generate_draft body: after setting draft.ir_json, before commit)
    from app.services.google_adapter import adapt_to_google

    draft.ir_json = ir.model_dump(mode="json")
    draft.google_plan_json = adapt_to_google(ir).model_dump(mode="json")
    draft.status = "adapted"
```

Note: `draft.status` is set to `"adapted"` here as an interim value. Task 9 changes it to only reach `"adapted"` once the Meta plan is populated too — see that task's full replacement snippet.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_google_adapter.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/google_plan.py backend/app/services/google_adapter.py backend/app/routers/generation.py backend/tests/test_google_adapter.py
git commit -m "feat: add Google Ads campaign adapter"
```

---

### Task 9: Meta Ads platform adapter

**Files:**
- Create: `backend/app/schemas/meta_plan.py`
- Create: `backend/app/services/meta_adapter.py`
- Modify: `backend/app/routers/generation.py` (wire in `adapt_to_meta`, finalize `status="adapted"`)
- Test: `backend/tests/test_meta_adapter.py`

**Interfaces:**
- Consumes: `CampaignIR` (Task 7).
- Produces: `app.schemas.meta_plan.MetaCampaignPlan` (`campaign_name: str`, `objective: str`, `ad_sets: list[MetaAdSet]` where `MetaAdSet` has `name: str, daily_budget_cents: int, targeting_description: str, creative_headline: str, creative_body: str, call_to_action: str`); `app.services.meta_adapter.adapt_to_meta(ir: CampaignIR) -> MetaCampaignPlan`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_meta_adapter.py
from app.schemas.campaign_ir import AdCopyVariant, CampaignIR
from app.services.meta_adapter import adapt_to_meta


def test_adapt_to_meta_converts_budget_and_creative():
    ir = CampaignIR(
        campaign_name="Austin Bakery Foot Traffic",
        objective="traffic",
        daily_budget_usd=16.5,
        keywords=["bakery near me"],
        audience_description="Adults 25-54 near Austin",
        ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
        call_to_action="Visit Us Today",
    )

    plan = adapt_to_meta(ir)

    assert plan.campaign_name == "Austin Bakery Foot Traffic"
    assert plan.objective == "traffic"
    assert len(plan.ad_sets) == 1
    assert plan.ad_sets[0].daily_budget_cents == 1650
    assert plan.ad_sets[0].targeting_description == "Adults 25-54 near Austin"
    assert plan.ad_sets[0].creative_headline == "Fresh Pastries Daily"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_meta_adapter.py -v`
Expected: FAIL (`ModuleNotFoundError: app.services.meta_adapter`)

- [ ] **Step 3: Write the schema and adapter**

```python
# backend/app/schemas/meta_plan.py
from pydantic import BaseModel


class MetaAdSet(BaseModel):
    name: str
    daily_budget_cents: int
    targeting_description: str
    creative_headline: str
    creative_body: str
    call_to_action: str


class MetaCampaignPlan(BaseModel):
    campaign_name: str
    objective: str
    ad_sets: list[MetaAdSet]
```

```python
# backend/app/services/meta_adapter.py
from app.schemas.campaign_ir import CampaignIR
from app.schemas.meta_plan import MetaAdSet, MetaCampaignPlan


def adapt_to_meta(ir: CampaignIR) -> MetaCampaignPlan:
    primary_copy = ir.ad_copy[0]
    ad_set = MetaAdSet(
        name=f"{ir.campaign_name} - Primary",
        daily_budget_cents=round(ir.daily_budget_usd * 100),
        targeting_description=ir.audience_description,
        creative_headline=primary_copy.headline,
        creative_body=primary_copy.description,
        call_to_action=ir.call_to_action,
    )
    return MetaCampaignPlan(campaign_name=ir.campaign_name, objective=ir.objective, ad_sets=[ad_set])
```

```python
# backend/app/routers/generation.py (replace the 3-line body added in Task 8 with this)
    from app.services.google_adapter import adapt_to_google
    from app.services.meta_adapter import adapt_to_meta

    draft.ir_json = ir.model_dump(mode="json")
    draft.google_plan_json = adapt_to_google(ir).model_dump(mode="json")
    draft.meta_plan_json = adapt_to_meta(ir).model_dump(mode="json")
    draft.status = "adapted"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_meta_adapter.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/meta_plan.py backend/app/services/meta_adapter.py backend/app/routers/generation.py backend/tests/test_meta_adapter.py
git commit -m "feat: add Meta Ads campaign adapter"
```

---

### Task 10: Guardrail engine (rule-based + LLM semantic check)

**Files:**
- Create: `backend/app/schemas/guardrail.py`
- Create: `backend/app/models/guardrail.py`
- Create: `backend/app/services/guardrails.py`
- Create: `backend/app/routers/guardrails.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_guardrails.py`

**Interfaces:**
- Consumes: `CampaignIR`, `BrandVoiceProfile`, `CampaignDraft`.
- Produces: `app.schemas.guardrail.GuardrailFlag` (`severity: Literal["block","warn"], code: str, message: str`); `app.services.guardrails.run_rule_checks(ir: CampaignIR, brand_voice: BrandVoiceProfile | None) -> list[GuardrailFlag]`; `app.services.guardrails.run_semantic_check(ir: CampaignIR, brand_voice: BrandVoiceProfile | None, anthropic_client) -> list[GuardrailFlag]`; model `GuardrailReport` (`campaign_draft_id`, `flags_json: list[dict]`, `has_blocking_flags: bool`); route `POST /briefs/{draft_id}/guardrails/run`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_guardrails.py
import json
from types import SimpleNamespace

from app.models.brand_voice import BrandVoiceProfile
from app.schemas.campaign_ir import AdCopyVariant, CampaignIR
from app.services.guardrails import run_rule_checks, run_semantic_check


class FakeAnthropicClient:
    def __init__(self, response_text: str):
        self._response_text = response_text

    class _Messages:
        def __init__(self, outer):
            self._outer = outer

        def create(self, **kwargs):
            return SimpleNamespace(content=[SimpleNamespace(text=self._outer._response_text)])

    @property
    def messages(self):
        return FakeAnthropicClient._Messages(self)


def _ir(daily_budget_usd=16.5, headline="Fresh Pastries Daily") -> CampaignIR:
    return CampaignIR(
        campaign_name="Austin Bakery",
        objective="traffic",
        daily_budget_usd=daily_budget_usd,
        keywords=["bakery near me"],
        audience_description="Adults 25-54 near Austin",
        ad_copy=[AdCopyVariant(headline=headline, description="Visit today.")],
        call_to_action="Visit Us Today",
    )


def test_rule_checks_flags_banned_term_and_extreme_budget():
    brand_voice = BrandVoiceProfile(
        client_id=None, tone="warm", banned_terms=["cheap"], required_disclaimers=[], approved_offers=[]
    )
    ir = _ir(daily_budget_usd=50_000, headline="Cheap Pastries Daily")

    flags = run_rule_checks(ir, brand_voice)

    codes = {f.code for f in flags}
    assert "banned_term" in codes
    assert "budget_out_of_range" in codes
    assert all(f.severity == "block" for f in flags if f.code in {"banned_term", "budget_out_of_range"})


def test_rule_checks_passes_clean_campaign():
    brand_voice = BrandVoiceProfile(
        client_id=None, tone="warm", banned_terms=["cheap"], required_disclaimers=[], approved_offers=[]
    )
    flags = run_rule_checks(_ir(), brand_voice)
    assert flags == []


def test_semantic_check_parses_llm_flags():
    fake_response = json.dumps(
        {"flags": [{"severity": "warn", "code": "off_brand_tone", "message": "Too casual for this client."}]}
    )
    fake_client = FakeAnthropicClient(fake_response)

    flags = run_semantic_check(_ir(), brand_voice=None, anthropic_client=fake_client)

    assert len(flags) == 1
    assert flags[0].code == "off_brand_tone"
    assert flags[0].severity == "warn"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_guardrails.py -v`
Expected: FAIL (`ModuleNotFoundError: app.services.guardrails`)

- [ ] **Step 3: Write the schema, model, and guardrail service**

```python
# backend/app/schemas/guardrail.py
import uuid
from typing import Literal

from pydantic import BaseModel


class GuardrailFlag(BaseModel):
    severity: Literal["block", "warn"]
    code: str
    message: str


class GuardrailReportResponse(BaseModel):
    id: uuid.UUID
    campaign_draft_id: uuid.UUID
    flags: list[GuardrailFlag]
    has_blocking_flags: bool

    model_config = {"from_attributes": True}
```

```python
# backend/app/models/guardrail.py
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class GuardrailReport(Base):
    __tablename__ = "guardrail_reports"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_draft_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaign_drafts.id"), unique=True)
    flags_json: Mapped[list[dict]] = mapped_column(JSON, default=list)
    has_blocking_flags: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
```

```python
# backend/app/models/__init__.py (replace)
from app.models.agency import Agency
from app.models.client import Client
from app.models.brand_voice import BrandVoiceProfile
from app.models.audit import AuditLog
from app.models.brief import Brief, CampaignDraft
from app.models.guardrail import GuardrailReport

__all__ = [
    "Agency",
    "Client",
    "BrandVoiceProfile",
    "AuditLog",
    "Brief",
    "CampaignDraft",
    "GuardrailReport",
]
```

```python
# backend/app/services/guardrails.py
import json

from app.config import get_settings
from app.models.brand_voice import BrandVoiceProfile
from app.schemas.campaign_ir import CampaignIR
from app.schemas.guardrail import GuardrailFlag

_MIN_DAILY_BUDGET_USD = 1.0
_MAX_DAILY_BUDGET_USD = 10_000.0

_SEMANTIC_SYSTEM_PROMPT = (
    "You review an ad campaign for brand-voice fit. Return strict JSON: "
    '{"flags": [{"severity": "block"|"warn", "code": str, "message": str}]}. '
    "Return an empty flags list if nothing is wrong. No prose outside the JSON."
)


def run_rule_checks(ir: CampaignIR, brand_voice: BrandVoiceProfile | None) -> list[GuardrailFlag]:
    flags: list[GuardrailFlag] = []

    if not (_MIN_DAILY_BUDGET_USD <= ir.daily_budget_usd <= _MAX_DAILY_BUDGET_USD):
        flags.append(
            GuardrailFlag(
                severity="block",
                code="budget_out_of_range",
                message=(
                    f"Daily budget ${ir.daily_budget_usd:,.2f} is outside the sane range "
                    f"(${_MIN_DAILY_BUDGET_USD:.0f}-${_MAX_DAILY_BUDGET_USD:,.0f})."
                ),
            )
        )

    if brand_voice:
        haystack = " ".join(
            [ir.campaign_name, *[c.headline + " " + c.description for c in ir.ad_copy]]
        ).lower()
        for banned in brand_voice.banned_terms:
            if banned.lower() in haystack:
                flags.append(
                    GuardrailFlag(
                        severity="block",
                        code="banned_term",
                        message=f"Generated copy contains banned term '{banned}'.",
                    )
                )

    return flags


def run_semantic_check(
    ir: CampaignIR, brand_voice: BrandVoiceProfile | None, anthropic_client
) -> list[GuardrailFlag]:
    settings = get_settings()
    tone = brand_voice.tone if brand_voice else "neutral, professional"
    prompt = (
        f"Required tone: {tone}\n"
        f"Campaign: {ir.model_dump_json()}\n"
        "Does the ad copy match the required tone and stay on-topic for the audience described? "
        "Flag anything that doesn't."
    )
    response = anthropic_client.messages.create(
        model=settings.anthropic_model,
        max_tokens=512,
        system=_SEMANTIC_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    parsed = json.loads(response.content[0].text)
    return [GuardrailFlag.model_validate(f) for f in parsed["flags"]]
```

```python
# backend/app/routers/guardrails.py
import uuid

from anthropic import Anthropic
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models.agency import Agency
from app.models.brief import CampaignDraft
from app.models.guardrail import GuardrailReport
from app.schemas.campaign_ir import CampaignIR
from app.schemas.guardrail import GuardrailFlag, GuardrailReportResponse
from app.security import get_current_agency
from app.services.audit import record_audit_event
from app.services.guardrails import run_rule_checks, run_semantic_check

router = APIRouter(prefix="/briefs", tags=["guardrails"])


@router.post("/{draft_id}/guardrails/run", response_model=GuardrailReportResponse)
def run_guardrails(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> GuardrailReportResponse:
    draft = db.get(CampaignDraft, draft_id)
    if draft is None or draft.brief.client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.ir_json is None:
        raise HTTPException(status_code=400, detail="Draft has not been generated yet")

    ir = CampaignIR.model_validate(draft.ir_json)
    brand_voice = draft.brief.client.brand_voice_profile

    flags = run_rule_checks(ir, brand_voice)
    anthropic_client = Anthropic(api_key=get_settings().anthropic_api_key)
    flags += run_semantic_check(ir, brand_voice, anthropic_client=anthropic_client)

    report = GuardrailReport(
        campaign_draft_id=draft.id,
        flags_json=[f.model_dump() for f in flags],
        has_blocking_flags=any(f.severity == "block" for f in flags),
    )
    db.add(report)
    draft.status = "guardrail_checked"
    db.commit()
    db.refresh(report)

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=draft.brief.client_id,
        event_type="draft.guardrails_run",
        payload={"draft_id": str(draft.id), "flag_count": len(flags)},
    )
    # Built explicitly rather than returned as the ORM object directly: GuardrailReport's
    # column is `flags_json`, not `flags`, so response_model's from_attributes conversion
    # would not find a matching attribute for the `flags` field.
    return GuardrailReportResponse(
        id=report.id,
        campaign_draft_id=report.campaign_draft_id,
        flags=[GuardrailFlag.model_validate(f) for f in report.flags_json],
        has_blocking_flags=report.has_blocking_flags,
    )
```

```python
# backend/app/main.py (add to imports and includes)
from app.routers import briefs, clients, generation, guardrails, me

app.include_router(guardrails.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_guardrails.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/guardrail.py backend/app/models/guardrail.py backend/app/models/__init__.py backend/app/services/guardrails.py backend/app/routers/guardrails.py backend/app/main.py backend/tests/test_guardrails.py
git commit -m "feat: add rule-based and LLM semantic guardrail checks"
```

---

### Task 11: Approval workflow

**Files:**
- Create: `backend/app/models/approval.py`
- Create: `backend/app/schemas/approval.py`
- Create: `backend/app/routers/approvals.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_approvals.py`

**Interfaces:**
- Consumes: `CampaignDraft`, `GuardrailReport`.
- Produces: model `Approval` (`campaign_draft_id`, `decision: Literal["approved","rejected"]`, `edited_ir_json: dict | None`, `reviewer_note: str | None`); route `POST /briefs/{draft_id}/approve` (body: `{decision, edited_ir: CampaignIR | None, reviewer_note: str | None}`) — rejects with 409 if `GuardrailReport.has_blocking_flags` is true and `decision == "approved"`; on success sets `draft.status = "approved"` or `"rejected"` and, if `edited_ir` was supplied, overwrites `draft.ir_json` with it before re-running the Google/Meta adapters.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_approvals.py
from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.guardrail import GuardrailReport
from app.schemas.campaign_ir import AdCopyVariant, CampaignIR
from tests.conftest import make_supabase_jwt

_IR = CampaignIR(
    campaign_name="Austin Bakery",
    objective="traffic",
    daily_budget_usd=16.5,
    keywords=["bakery near me"],
    audience_description="Adults 25-54 near Austin",
    ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
    call_to_action="Visit Us Today",
).model_dump(mode="json")


def _setup(db_session, has_blocking_flags: bool):
    agency = Agency(
        supabase_user_id=f"sb-approvals-{has_blocking_flags}",
        name="Acme",
        email=f"approvals{has_blocking_flags}@acme.test",
    )
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Client A")
    db_session.add(client_row)
    db_session.flush()
    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    draft = CampaignDraft(brief_id=brief.id, ir_json=_IR, status="guardrail_checked")
    db_session.add(draft)
    db_session.flush()
    report = GuardrailReport(campaign_draft_id=draft.id, flags_json=[], has_blocking_flags=has_blocking_flags)
    db_session.add(report)
    db_session.commit()
    token = make_supabase_jwt(agency.supabase_user_id)
    return draft, {"Authorization": f"Bearer {token}"}


def test_approve_succeeds_when_no_blocking_flags(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    draft, headers = _setup(db_session, has_blocking_flags=False)

    response = client.post(
        f"/briefs/{draft.id}/approve",
        json={"decision": "approved", "edited_ir": None, "reviewer_note": "Looks good"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    main.app.dependency_overrides.clear()


def test_approve_blocked_when_report_has_blocking_flags(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    draft, headers = _setup(db_session, has_blocking_flags=True)

    response = client.post(
        f"/briefs/{draft.id}/approve",
        json={"decision": "approved", "edited_ir": None, "reviewer_note": None},
        headers=headers,
    )

    assert response.status_code == 409
    main.app.dependency_overrides.clear()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_approvals.py -v`
Expected: FAIL (404 — no `/briefs/{draft_id}/approve` route yet)

- [ ] **Step 3: Write the model, schema, and router**

```python
# backend/app/models/approval.py
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Approval(Base):
    __tablename__ = "approvals"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_draft_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaign_drafts.id"))
    decision: Mapped[str] = mapped_column(String(20))
    edited_ir_json: Mapped[dict | None] = mapped_column(JSON, default=None)
    reviewer_note: Mapped[str | None] = mapped_column(String(1000), default=None)
    decided_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
```

```python
# backend/app/models/__init__.py (replace)
from app.models.agency import Agency
from app.models.client import Client
from app.models.brand_voice import BrandVoiceProfile
from app.models.audit import AuditLog
from app.models.brief import Brief, CampaignDraft
from app.models.guardrail import GuardrailReport
from app.models.approval import Approval

__all__ = [
    "Agency",
    "Client",
    "BrandVoiceProfile",
    "AuditLog",
    "Brief",
    "CampaignDraft",
    "GuardrailReport",
    "Approval",
]
```

```python
# backend/app/schemas/approval.py
from typing import Literal

from pydantic import BaseModel

from app.schemas.campaign_ir import CampaignIR


class ApprovalRequest(BaseModel):
    decision: Literal["approved", "rejected"]
    edited_ir: CampaignIR | None = None
    reviewer_note: str | None = None


class ApprovalResponse(BaseModel):
    status: str
```

```python
# backend/app/routers/approvals.py
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.agency import Agency
from app.models.approval import Approval
from app.models.brief import CampaignDraft
from app.models.guardrail import GuardrailReport
from app.schemas.approval import ApprovalRequest, ApprovalResponse
from app.security import get_current_agency
from app.services.audit import record_audit_event
from app.services.google_adapter import adapt_to_google
from app.services.meta_adapter import adapt_to_meta

router = APIRouter(prefix="/briefs", tags=["approvals"])


@router.post("/{draft_id}/approve", response_model=ApprovalResponse)
def decide_draft(
    draft_id: uuid.UUID,
    body: ApprovalRequest,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> ApprovalResponse:
    draft = db.get(CampaignDraft, draft_id)
    if draft is None or draft.brief.client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Draft not found")

    if body.decision == "approved":
        report = db.scalar(select(GuardrailReport).where(GuardrailReport.campaign_draft_id == draft.id))
        if report is not None and report.has_blocking_flags:
            raise HTTPException(status_code=409, detail="Cannot approve a draft with blocking guardrail flags")

        if body.edited_ir is not None:
            draft.ir_json = body.edited_ir.model_dump(mode="json")
            draft.google_plan_json = adapt_to_google(body.edited_ir).model_dump(mode="json")
            draft.meta_plan_json = adapt_to_meta(body.edited_ir).model_dump(mode="json")

    approval = Approval(
        campaign_draft_id=draft.id,
        decision=body.decision,
        edited_ir_json=body.edited_ir.model_dump(mode="json") if body.edited_ir else None,
        reviewer_note=body.reviewer_note,
    )
    db.add(approval)
    draft.status = body.decision
    db.commit()

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=draft.brief.client_id,
        event_type=f"draft.{body.decision}",
        payload={"draft_id": str(draft.id), "reviewer_note": body.reviewer_note},
    )
    return ApprovalResponse(status=draft.status)
```

```python
# backend/app/main.py (add to imports and includes)
from app.routers import approvals, briefs, clients, generation, guardrails, me

app.include_router(approvals.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_approvals.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/approval.py backend/app/models/__init__.py backend/app/schemas/approval.py backend/app/routers/approvals.py backend/app/main.py backend/tests/test_approvals.py
git commit -m "feat: add campaign approval workflow with guardrail block enforcement"
```

---

### Task 12: Batch push worker (Google Ads + Meta, queued, per-client status)

**Files:**
- Create: `backend/app/models/launch.py`
- Create: `backend/app/services/google_ads_client.py`
- Create: `backend/app/services/meta_ads_client.py`
- Create: `backend/app/workers/__init__.py`
- Create: `backend/app/workers/queue.py`
- Create: `backend/app/workers/push_jobs.py`
- Create: `backend/app/routers/launches.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_push_jobs.py`

**Interfaces:**
- Consumes: `CampaignDraft` (must have `status == "approved"`), `Client` (must have credentials).
- Produces: model `LaunchRecord` (`campaign_draft_id`, `platform: Literal["google","meta"]`, `status: Literal["pending","success","failed"]`, `external_campaign_id: str | None`, `error_message: str | None`); Protocol `GoogleAdsPushPort.push(plan: GoogleCampaignPlan, refresh_token: str, customer_id: str) -> str` (returns external campaign id) with `FakeGoogleAdsPushClient` and `RealGoogleAdsPushClient`; same shape for Meta (`MetaAdsPushPort`, `FakeMetaAdsPushClient`, `RealMetaAdsPushClient`); `app.workers.push_jobs.push_draft(draft_id: str) -> None` (RQ job: pushes to both platforms independently, retries transient failures up to 3 times with exponential backoff, writes one `LaunchRecord` per platform regardless of the other's outcome); route `POST /briefs/{draft_id}/launch` enqueues the job and returns `202`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_push_jobs.py
from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.launch import LaunchRecord
from app.schemas.campaign_ir import AdCopyVariant, CampaignIR
from app.services.google_adapter import adapt_to_google
from app.services.meta_adapter import adapt_to_meta
from app.services.google_ads_client import FakeGoogleAdsPushClient
from app.services.meta_ads_client import FakeMetaAdsPushClient
from app.workers.push_jobs import push_draft_with_clients


def _draft(db_session, google_connected=True, meta_connected=True) -> CampaignDraft:
    agency = Agency(supabase_user_id="sb-push-1", name="Acme", email="push@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(
        agency_id=agency.id,
        name="Client A",
        google_ads_customer_id="123-456-7890" if google_connected else None,
        google_refresh_token_encrypted=b"encrypted" if google_connected else None,
        meta_ad_account_id="act_999" if meta_connected else None,
        meta_access_token_encrypted=b"encrypted" if meta_connected else None,
    )
    db_session.add(client_row)
    db_session.flush()
    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    ir = CampaignIR(
        campaign_name="Austin Bakery",
        objective="traffic",
        daily_budget_usd=16.5,
        keywords=["bakery near me"],
        audience_description="Adults 25-54 near Austin",
        ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
        call_to_action="Visit Us Today",
    )
    draft = CampaignDraft(
        brief_id=brief.id,
        status="approved",
        ir_json=ir.model_dump(mode="json"),
        google_plan_json=adapt_to_google(ir).model_dump(mode="json"),
        meta_plan_json=adapt_to_meta(ir).model_dump(mode="json"),
    )
    db_session.add(draft)
    db_session.commit()
    return draft


def test_push_draft_writes_success_launch_records_for_both_platforms(db_session, monkeypatch):
    # Patched where push_jobs.py looks it up (it does `from app.encryption import decrypt_token`,
    # so patching app.encryption.decrypt_token would not affect the already-bound name here).
    monkeypatch.setattr("app.workers.push_jobs.decrypt_token", lambda blob: "decrypted-token")
    draft = _draft(db_session)

    push_draft_with_clients(
        db_session,
        draft.id,
        google_client=FakeGoogleAdsPushClient(external_id="google-camp-1"),
        meta_client=FakeMetaAdsPushClient(external_id="meta-camp-1"),
    )

    records = db_session.query(LaunchRecord).filter_by(campaign_draft_id=draft.id).all()
    by_platform = {r.platform: r for r in records}
    assert by_platform["google"].status == "success"
    assert by_platform["google"].external_campaign_id == "google-camp-1"
    assert by_platform["meta"].status == "success"
    assert by_platform["meta"].external_campaign_id == "meta-camp-1"


def test_push_draft_records_failure_independently_per_platform(db_session, monkeypatch):
    monkeypatch.setattr("app.workers.push_jobs.decrypt_token", lambda blob: "decrypted-token")
    draft = _draft(db_session)

    push_draft_with_clients(
        db_session,
        draft.id,
        google_client=FakeGoogleAdsPushClient(raise_error=RuntimeError("quota exceeded")),
        meta_client=FakeMetaAdsPushClient(external_id="meta-camp-1"),
    )

    records = db_session.query(LaunchRecord).filter_by(campaign_draft_id=draft.id).all()
    by_platform = {r.platform: r for r in records}
    assert by_platform["google"].status == "failed"
    assert "quota exceeded" in by_platform["google"].error_message
    assert by_platform["meta"].status == "success"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_push_jobs.py -v`
Expected: FAIL (`ModuleNotFoundError: app.models.launch`)

- [ ] **Step 3: Write the model, push client ports, queue, and job**

```python
# backend/app/models/launch.py
import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class LaunchRecord(Base):
    __tablename__ = "launch_records"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_draft_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaign_drafts.id"))
    platform: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10), default="pending")
    external_campaign_id: Mapped[str | None] = mapped_column(String(64), default=None)
    error_message: Mapped[str | None] = mapped_column(String(1000), default=None)
    attempted_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
```

```python
# backend/app/models/__init__.py (replace)
from app.models.agency import Agency
from app.models.client import Client
from app.models.brand_voice import BrandVoiceProfile
from app.models.audit import AuditLog
from app.models.brief import Brief, CampaignDraft
from app.models.guardrail import GuardrailReport
from app.models.approval import Approval
from app.models.launch import LaunchRecord

__all__ = [
    "Agency",
    "Client",
    "BrandVoiceProfile",
    "AuditLog",
    "Brief",
    "CampaignDraft",
    "GuardrailReport",
    "Approval",
    "LaunchRecord",
]
```

```python
# backend/app/services/google_ads_client.py
from typing import Protocol

from app.config import get_settings
from app.schemas.google_plan import GoogleCampaignPlan


class GoogleAdsPushPort(Protocol):
    def push(self, plan: GoogleCampaignPlan, refresh_token: str, customer_id: str) -> str: ...


class FakeGoogleAdsPushClient:
    def __init__(self, external_id: str = "fake-google-campaign", raise_error: Exception | None = None):
        self._external_id = external_id
        self._raise_error = raise_error

    def push(self, plan: GoogleCampaignPlan, refresh_token: str, customer_id: str) -> str:
        if self._raise_error is not None:
            raise self._raise_error
        return self._external_id


class RealGoogleAdsPushClient:
    """Thin wrapper around the official google-ads SDK. Exercised only by the
    opt-in sandbox test in Task 13, not by the fast unit test suite."""

    def push(self, plan: GoogleCampaignPlan, refresh_token: str, customer_id: str) -> str:
        from google.ads.googleads.client import GoogleAdsClient

        settings = get_settings()
        client = GoogleAdsClient.load_from_dict(
            {
                "developer_token": settings.google_ads_developer_token,
                "client_id": settings.google_ads_client_id,
                "client_secret": settings.google_ads_client_secret,
                "refresh_token": refresh_token,
                "use_proto_plus": True,
            }
        )
        campaign_budget_service = client.get_service("CampaignBudgetService")
        campaign_service = client.get_service("CampaignService")
        ad_group_service = client.get_service("AdGroupService")

        budget_op = client.get_type("CampaignBudgetOperation")
        budget_op.create.name = f"{plan.campaign_name} Budget"
        budget_op.create.amount_micros = plan.daily_budget_micros
        budget_resource = campaign_budget_service.mutate_campaign_budgets(
            customer_id=customer_id, operations=[budget_op]
        ).results[0].resource_name

        campaign_op = client.get_type("CampaignOperation")
        campaign_op.create.name = plan.campaign_name
        campaign_op.create.campaign_budget = budget_resource
        campaign_op.create.advertising_channel_type = client.enums.AdvertisingChannelTypeEnum.SEARCH
        campaign_op.create.status = client.enums.CampaignStatusEnum.PAUSED
        campaign_result = campaign_service.mutate_campaigns(
            customer_id=customer_id, operations=[campaign_op]
        ).results[0]

        for group in plan.ad_groups:
            group_op = client.get_type("AdGroupOperation")
            group_op.create.name = group.name
            group_op.create.campaign = campaign_result.resource_name
            ad_group_service.mutate_ad_groups(customer_id=customer_id, operations=[group_op])

        return campaign_result.resource_name
```

```python
# backend/app/services/meta_ads_client.py
from typing import Protocol

from app.config import get_settings
from app.schemas.meta_plan import MetaCampaignPlan


class MetaAdsPushPort(Protocol):
    def push(self, plan: MetaCampaignPlan, access_token: str, ad_account_id: str) -> str: ...


class FakeMetaAdsPushClient:
    def __init__(self, external_id: str = "fake-meta-campaign", raise_error: Exception | None = None):
        self._external_id = external_id
        self._raise_error = raise_error

    def push(self, plan: MetaCampaignPlan, access_token: str, ad_account_id: str) -> str:
        if self._raise_error is not None:
            raise self._raise_error
        return self._external_id


class RealMetaAdsPushClient:
    """Thin wrapper around the official facebook-business SDK. Exercised only
    by the opt-in sandbox test in Task 13, not by the fast unit test suite."""

    def push(self, plan: MetaCampaignPlan, access_token: str, ad_account_id: str) -> str:
        from facebook_business.adobjects.adaccount import AdAccount
        from facebook_business.adobjects.campaign import Campaign
        from facebook_business.api import FacebookAdsApi

        settings = get_settings()
        FacebookAdsApi.init(settings.meta_app_id, settings.meta_app_secret, access_token)
        account = AdAccount(ad_account_id)
        campaign = account.create_campaign(
            params={
                Campaign.Field.name: plan.campaign_name,
                Campaign.Field.objective: plan.objective.upper(),
                Campaign.Field.status: Campaign.Status.paused,
            }
        )
        return campaign[Campaign.Field.id]
```

```python
# backend/app/workers/queue.py
from redis import Redis
from rq import Queue

from app.config import get_settings


def get_queue() -> Queue:
    settings = get_settings()
    return Queue("push", connection=Redis.from_url(settings.redis_url))
```

```python
# backend/app/workers/push_jobs.py
import time
import uuid

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.encryption import decrypt_token
from app.models.brief import CampaignDraft
from app.models.launch import LaunchRecord
from app.schemas.google_plan import GoogleCampaignPlan
from app.schemas.meta_plan import MetaCampaignPlan
from app.services.google_ads_client import GoogleAdsPushPort, RealGoogleAdsPushClient
from app.services.meta_ads_client import MetaAdsPushPort, RealMetaAdsPushClient

_MAX_ATTEMPTS = 3
_BACKOFF_SECONDS = 2


def _push_with_retry(push_fn) -> tuple[str | None, str | None]:
    last_error: str | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            return push_fn(), None
        except Exception as exc:  # noqa: BLE001 — recorded per-platform, not re-raised
            last_error = str(exc)
            if attempt < _MAX_ATTEMPTS:
                time.sleep(_BACKOFF_SECONDS * attempt)
    return None, last_error


def push_draft_with_clients(
    db: Session,
    draft_id: uuid.UUID,
    google_client: GoogleAdsPushPort,
    meta_client: MetaAdsPushPort,
) -> None:
    draft = db.get(CampaignDraft, draft_id)
    client_row = draft.brief.client

    if client_row.google_refresh_token_encrypted and draft.google_plan_json:
        plan = GoogleCampaignPlan.model_validate(draft.google_plan_json)
        refresh_token = decrypt_token(client_row.google_refresh_token_encrypted)
        external_id, error = _push_with_retry(
            lambda: google_client.push(plan, refresh_token, client_row.google_ads_customer_id)
        )
        db.add(
            LaunchRecord(
                campaign_draft_id=draft.id,
                platform="google",
                status="success" if error is None else "failed",
                external_campaign_id=external_id,
                error_message=error,
            )
        )

    if client_row.meta_access_token_encrypted and draft.meta_plan_json:
        plan = MetaCampaignPlan.model_validate(draft.meta_plan_json)
        access_token = decrypt_token(client_row.meta_access_token_encrypted)
        external_id, error = _push_with_retry(
            lambda: meta_client.push(plan, access_token, client_row.meta_ad_account_id)
        )
        db.add(
            LaunchRecord(
                campaign_draft_id=draft.id,
                platform="meta",
                status="success" if error is None else "failed",
                external_campaign_id=external_id,
                error_message=error,
            )
        )

    draft.status = "launched"
    db.commit()


def push_draft(draft_id: str) -> None:
    """RQ entrypoint — uses the real SDK-backed clients."""
    db = SessionLocal()
    try:
        push_draft_with_clients(
            db,
            uuid.UUID(draft_id),
            google_client=RealGoogleAdsPushClient(),
            meta_client=RealMetaAdsPushClient(),
        )
    finally:
        db.close()
```

```python
# backend/app/routers/launches.py
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.agency import Agency
from app.models.brief import CampaignDraft
from app.security import get_current_agency
from app.workers.push_jobs import push_draft
from app.workers.queue import get_queue

router = APIRouter(prefix="/briefs", tags=["launches"])


@router.post("/{draft_id}/launch", status_code=status.HTTP_202_ACCEPTED)
def launch_draft(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> dict[str, str]:
    draft = db.get(CampaignDraft, draft_id)
    if draft is None or draft.brief.client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.status != "approved":
        raise HTTPException(status_code=400, detail="Draft must be approved before launch")

    get_queue().enqueue(push_draft, str(draft.id))
    return {"status": "queued"}
```

```python
# backend/app/main.py (add to imports and includes)
from app.routers import approvals, briefs, clients, generation, guardrails, launches, me

app.include_router(launches.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_push_jobs.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/launch.py backend/app/models/__init__.py backend/app/services/google_ads_client.py backend/app/services/meta_ads_client.py backend/app/workers backend/app/routers/launches.py backend/app/main.py backend/tests/test_push_jobs.py
git commit -m "feat: add queued batch push to Google Ads and Meta with per-platform retry"
```

---

### Task 13: End-to-end sandbox integration test

**Files:**
- Create: `backend/tests/test_e2e_sandbox.py`
- Create: `backend/tests/README.md`

**Interfaces:**
- Consumes: the full pipeline built in Tasks 1-12, `RealGoogleAdsPushClient`, `RealMetaAdsPushClient`.
- Produces: an opt-in integration test that exercises brief → generate → adapt → guardrails → approve → launch against real Google Ads and Meta **test/sandbox** accounts, skipped automatically unless sandbox credentials are present in the environment.

- [ ] **Step 1: Write the skipped-by-default integration test**

```python
# backend/tests/test_e2e_sandbox.py
import os
import time

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.skipif(
    not os.getenv("SANDBOX_GOOGLE_ADS_CUSTOMER_ID") or not os.getenv("SANDBOX_META_AD_ACCOUNT_ID"),
    reason="Set SANDBOX_GOOGLE_ADS_CUSTOMER_ID and SANDBOX_META_AD_ACCOUNT_ID to run the sandbox E2E test",
)


def test_full_pipeline_against_sandbox_accounts(client: TestClient, db_session):
    """
    Prerequisites (see backend/tests/README.md):
    - A Google Ads test account (Test/Explorer access level) with a valid refresh token
      already stored for a seeded Client row (SANDBOX_GOOGLE_ADS_CUSTOMER_ID).
    - A Meta sandbox ad account (SANDBOX_META_AD_ACCOUNT_ID) with a valid access token.
    - ANTHROPIC_API_KEY set to a real key (this test makes a real Claude call).
    This test is intentionally excluded from the default `pytest` run — see pytestmark above.
    """
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session

    # 1. Create agency + client, attach sandbox credentials directly (OAuth UI is Plan 2's job).
    # 2. Submit a brief for that client.
    # 3. POST /briefs/{id}/generate, then poll status until "adapted".
    # 4. POST /briefs/{id}/guardrails/run and assert has_blocking_flags is False for a clean brief.
    # 5. POST /briefs/{id}/approve with decision="approved".
    # 6. POST /briefs/{id}/launch, then poll LaunchRecord rows until both platforms report
    #    "success" or "failed" (timeout after 60s), and assert both external_campaign_id values
    #    were returned by the real sandbox accounts.
    # Full step-by-step wiring is written when this test is first run against real sandbox
    # credentials, since the exact seeding SQL depends on whichever sandbox account IDs are
    # provisioned at that time.
    pytest.skip("Sandbox credentials wiring is completed when sandbox accounts are provisioned")
```

```markdown
# backend/tests/README.md

## Running the sandbox end-to-end test

`test_e2e_sandbox.py` is skipped by default. To run it against real Google Ads and Meta
test accounts:

1. Create a Google Ads **test account** under your manager account (Ads > Tools > Setup >
   Test accounts) and complete Test/Explorer API access — see
   https://developers.google.com/google-ads/api/docs/access-levels#test-account-access.
2. Create a Meta **sandbox ad account** in Meta Business Manager
   (business settings > Accounts > Ad Accounts > Add > Create a new sandbox ad account).
3. Obtain a refresh token (Google) and access token (Meta) for those test accounts by running
   the OAuth connect flow (`/clients/{id}/google/oauth/start`, `/clients/{id}/meta/oauth/start`)
   against them once, same as a real pilot client.
4. Export: `SANDBOX_GOOGLE_ADS_CUSTOMER_ID`, `SANDBOX_META_AD_ACCOUNT_ID`, `ANTHROPIC_API_KEY`,
   `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`,
   `META_APP_ID`, `META_APP_SECRET`, `DATABASE_URL` (your Supabase Postgres connection string),
   `SUPABASE_JWT_SECRET` (Supabase project settings > API > JWT Secret), `TOKEN_ENCRYPTION_KEY`.
5. Run: `cd backend && python -m pytest tests/test_e2e_sandbox.py -v`
```

- [ ] **Step 2: Run the fast suite to confirm the new test is skipped, not broken**

Run: `cd backend && python -m pytest -v`
Expected: all prior tests PASS; `test_full_pipeline_against_sandbox_accounts` shows SKIPPED

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_e2e_sandbox.py backend/tests/README.md
git commit -m "test: add opt-in sandbox end-to-end pipeline test and setup docs"
```

---

## Deployment sequencing

All 13 tasks above are built and verified **locally first** — `pytest` against the SQLite in-memory `db_session` fixture, and manual smoke-testing against a local Supabase Postgres connection string (`DATABASE_URL`) and Redis instance. Going live is a separate, later step, not part of this plan: once the pipeline works end-to-end locally, deploy the FastAPI app and the RQ worker to **Railway** (it runs a Python app + a background worker + Redis from this repo with minimal setup, which fits a pilot's scale — see the earlier discussion on why Railway over something heavier like AWS/GCP at this stage). Supabase itself is already remote-hosted from Task 1 onward, since local dev points `DATABASE_URL` at the same Supabase project real pilot agencies will eventually use — there's no separate "local Postgres" to stand up.

## What this plan does not cover (by design)

- **Frontend** (brief intake UI, batch CSV upload, approval review screen, client OAuth connect UI, launch status dashboard) — Plan 2, written after this backend is reviewed.
- **Self-serve signup, billing, public marketing site** — explicitly deferred per the design spec's pilot rollout model.
- **Filling in the sandbox E2E test's step-by-step body** — deliberately left as a skipped stub with a clear setup doc, since it depends on sandbox account IDs that don't exist until Google/Meta test accounts are actually provisioned; wiring it in is a fast follow-up once those exist, not a redesign.
- **Deploying to Railway** — this plan only covers building and locally verifying the backend; standing up the Railway project (or any production host) is a deliberately separate step once the pipeline is proven locally, per the Deployment sequencing note above.
