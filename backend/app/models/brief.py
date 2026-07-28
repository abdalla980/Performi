import uuid
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Date, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Brief(Base):
    __tablename__ = "briefs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id"))
    business_description: Mapped[str] = mapped_column(String(2000))
    budget_usd: Mapped[float] = mapped_column(Float)
    goals: Mapped[str] = mapped_column(String(1000))
    website_url: Mapped[str | None] = mapped_column(String(2000), default=None)
    target_location: Mapped[str | None] = mapped_column(String(500), default=None)
    target_audience: Mapped[str | None] = mapped_column(String(1000), default=None)
    end_date: Mapped[date | None] = mapped_column(Date, default=None)
    platforms: Mapped[list[str]] = mapped_column(JSON, default=lambda: ["google", "meta"])
    competitors: Mapped[str | None] = mapped_column(String(1000), default=None)
    unique_selling_points: Mapped[str | None] = mapped_column(String(1000), default=None)
    excluded_keywords: Mapped[list[str]] = mapped_column(JSON, default=list)
    # Agency-entered facts — force-passed into IR extensions / segment names (not LLM-invented).
    services_offered: Mapped[list] = mapped_column(JSON, default=list)
    trust_signals: Mapped[list] = mapped_column(JSON, default=list)
    audience_hints: Mapped[list] = mapped_column(JSON, default=list)
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
    archived_at: Mapped[datetime | None] = mapped_column(default=None)

    brief: Mapped["Brief"] = relationship(back_populates="draft")
