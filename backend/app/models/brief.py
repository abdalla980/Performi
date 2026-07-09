import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Float, ForeignKey, String
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
