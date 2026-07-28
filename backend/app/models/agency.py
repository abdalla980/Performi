import uuid
from datetime import datetime, timezone

from sqlalchemy import LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Agency(Base):
    __tablename__ = "agencies"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    supabase_user_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    # Agency-wide manager credentials (one OAuth connect for all clients).
    google_ads_refresh_token_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, default=None)
    google_ads_login_customer_id: Mapped[str | None] = mapped_column(String(32), default=None)
    meta_access_token_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, default=None)
    meta_business_id: Mapped[str | None] = mapped_column(String(64), default=None)

    clients: Mapped[list["Client"]] = relationship(back_populates="agency")
