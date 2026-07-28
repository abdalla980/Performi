import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id"))
    name: Mapped[str] = mapped_column(String(255))
    supabase_user_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, default=None)

    # Linked account IDs under the agency's manager / Business Manager (set by paste).
    google_ads_customer_id: Mapped[str | None] = mapped_column(String(32), default=None)
    meta_ad_account_id: Mapped[str | None] = mapped_column(String(64), default=None)

    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    agency: Mapped["Agency"] = relationship(back_populates="clients")
    brand_voice_profile: Mapped["BrandVoiceProfile"] = relationship(
        back_populates="client", uselist=False
    )
    assets: Mapped[list["ClientAsset"]] = relationship(back_populates="client", order_by="ClientAsset.created_at")

    @property
    def has_real_platform_connection(self) -> bool:
        """True once this client is linked to a real (non-demo) Google Ads or Meta
        account -- i.e. a real launch is actually possible for them. Used to gate real
        LLM calls: generating/reviewing with real AI is pointless spend for a client
        that can only ever demo-launch anyway."""

        def _is_real(account_id: str | None) -> bool:
            return bool(account_id) and not account_id.startswith("demo-")

        return _is_real(self.google_ads_customer_id) or _is_real(self.meta_ad_account_id)
