import uuid
from datetime import datetime

from pydantic import BaseModel


class AuditLogEntryResponse(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID | None
    event_type: str
    payload: dict
    created_at: datetime

    model_config = {"from_attributes": True}
