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
