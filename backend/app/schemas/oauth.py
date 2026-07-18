from pydantic import BaseModel


class OAuthAuthorizeUrlResponse(BaseModel):
    authorize_url: str
