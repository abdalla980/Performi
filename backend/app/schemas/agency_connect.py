from pydantic import BaseModel


class GoogleManagerAccountRequest(BaseModel):
    login_customer_id: str


class MetaBusinessAccountRequest(BaseModel):
    business_id: str
