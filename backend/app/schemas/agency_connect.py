from pydantic import BaseModel


class GoogleManagerAccountRequest(BaseModel):
    login_customer_id: str
