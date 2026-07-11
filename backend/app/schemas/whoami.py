import uuid
from typing import Literal

from pydantic import BaseModel


class WhoAmIResponse(BaseModel):
    role: Literal["agency", "client"]
    id: uuid.UUID
    name: str
