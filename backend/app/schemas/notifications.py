import uuid
from typing import Literal

from pydantic import BaseModel

NotificationKind = Literal[
    "pending_approval_stale", "client_pending_stale", "guardrail_blocked", "launch_failed"
]


class NotificationItem(BaseModel):
    draft_id: uuid.UUID
    client_name: str
    kind: NotificationKind
    days_stale: int
