from fastapi import APIRouter, Depends

from app.models.agency import Agency
from app.schemas.agency import AgencyResponse
from app.security import get_current_agency

router = APIRouter(tags=["me"])


@router.get("/me", response_model=AgencyResponse)
def read_current_agency(agency: Agency = Depends(get_current_agency)) -> Agency:
    return agency
