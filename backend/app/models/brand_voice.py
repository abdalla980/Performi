import uuid

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class BrandVoiceProfile(Base):
    __tablename__ = "brand_voice_profiles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("clients.id"), unique=True)
    tone: Mapped[str] = mapped_column(String(500))
    banned_terms: Mapped[list[str]] = mapped_column(JSON, default=list)
    required_disclaimers: Mapped[list[str]] = mapped_column(JSON, default=list)
    approved_offers: Mapped[list[str]] = mapped_column(JSON, default=list)

    client: Mapped["Client"] = relationship(back_populates="brand_voice_profile")
