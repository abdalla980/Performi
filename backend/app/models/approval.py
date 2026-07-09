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
