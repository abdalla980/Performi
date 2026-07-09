import uuid

from pydantic import BaseModel


class AgencyResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str

    model_config = {"from_attributes": True}
