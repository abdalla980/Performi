from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.db import Base, engine, get_db  # get_db re-exported for dependency_overrides in tests
from app.routers import (
    approvals,
    audit,
    briefs,
    client_assets,
    client_portal,
    clients,
    config,
    generation,
    guardrails,
    launches,
    me,
    notifications,
    stats,
    whoami,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Agency Campaign Generator (MVP)", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_uploads_dir = Path(get_settings().uploads_dir)
_uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")
app.include_router(me.router)
app.include_router(whoami.router)
app.include_router(config.router)
app.include_router(clients.router)
app.include_router(client_assets.router)
app.include_router(briefs.router)
app.include_router(generation.router)
app.include_router(guardrails.router)
app.include_router(approvals.router)
app.include_router(launches.router)
app.include_router(notifications.router)
app.include_router(stats.router)
app.include_router(audit.router)
app.include_router(client_portal.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
