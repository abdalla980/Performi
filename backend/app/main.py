from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import Base, engine, get_db  # get_db re-exported for dependency_overrides in tests
from app.routers import approvals, audit, briefs, clients, config, generation, guardrails, launches, me


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Agency Campaign Generator (MVP)", lifespan=lifespan)
app.include_router(me.router)
app.include_router(config.router)
app.include_router(clients.router)
app.include_router(briefs.router)
app.include_router(generation.router)
app.include_router(guardrails.router)
app.include_router(approvals.router)
app.include_router(launches.router)
app.include_router(audit.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
