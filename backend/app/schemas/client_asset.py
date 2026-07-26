import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ClientAssetResponse(BaseModel):
    id: uuid.UUID
    kind: Literal["logo", "image"]
    filename: str
    url: str
    created_at: datetime
