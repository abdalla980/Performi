from app.models.brand_voice import BrandVoiceProfile
from app.schemas.google_plan import GoogleCampaignPlan, Sitelink


def attach_sitelinks(plan: GoogleCampaignPlan, brand_voice: BrandVoiceProfile | None) -> GoogleCampaignPlan:
    """Populate Google plan sitelinks from the client's agency-entered brand voice."""
    if brand_voice is None:
        return plan
    plan.sitelinks = [Sitelink(**s) for s in (brand_voice.sitelinks or [])]
    return plan
