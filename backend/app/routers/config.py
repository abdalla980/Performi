from fastapi import APIRouter, Depends

from app.config import get_settings
from app.models.agency import Agency
from app.security import get_current_agency

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/status")
def config_status(agency: Agency = Depends(get_current_agency)) -> dict[str, bool]:
    """Per-agency readiness: app-level credentials AND this agency's manager connect."""
    settings = get_settings()
    return {
        "anthropic_configured": bool(settings.anthropic_api_key),
        "google_ads_configured": bool(
            settings.google_ads_client_id
            and settings.google_ads_client_secret
            and settings.google_ads_developer_token
            and agency.google_ads_refresh_token_encrypted
            and agency.google_ads_login_customer_id
        ),
        "meta_configured": bool(
            settings.meta_app_id and settings.meta_app_secret and agency.meta_access_token_encrypted
        ),
    }
