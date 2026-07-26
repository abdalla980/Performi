from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.agency import Agency
from app.models.client import Client
from app.schemas.whoami import WhoAmIResponse
from app.security import verify_supabase_token

router = APIRouter(tags=["whoami"])
_bearer = HTTPBearer()


@router.get("/whoami", response_model=WhoAmIResponse)
def whoami(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> WhoAmIResponse:
    supabase_user_id = verify_supabase_token(credentials)

    agency = db.scalar(select(Agency).where(Agency.supabase_user_id == supabase_user_id))
    if agency is not None:
        return WhoAmIResponse(role="agency", id=agency.id, name=agency.name)

    client_row = db.scalar(select(Client).where(Client.supabase_user_id == supabase_user_id))
    if client_row is not None:
        return WhoAmIResponse(
            role="client", id=client_row.id, name=client_row.name, agency_name=client_row.agency.name
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="No agency or client linked to this Supabase account"
    )
