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
