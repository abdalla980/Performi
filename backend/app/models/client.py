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
    supabase_user_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, default=None)

    google_ads_customer_id: Mapped[str | None] = mapped_column(String(32), default=None)
    google_refresh_token_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, default=None)

    meta_ad_account_id: Mapped[str | None] = mapped_column(String(64), default=None)
    meta_access_token_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, default=None)

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    agency: Mapped["Agency"] = relationship(back_populates="clients")
    brand_voice_profile: Mapped["BrandVoiceProfile"] = relationship(
        back_populates="client", uselist=False
    )
    assets: Mapped[list["ClientAsset"]] = relationship(back_populates="client", order_by="ClientAsset.created_at")
