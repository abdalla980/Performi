from app.models.brand_voice import BrandVoiceProfile
from app.schemas.google_plan import GoogleCampaignPlan
from app.services.sitelinks import attach_sitelinks


def test_attach_sitelinks_copies_from_brand_voice():
    plan = GoogleCampaignPlan(
        campaign_name="Test",
        daily_budget_micros=1_000_000,
        final_url="https://example.com",
        ad_groups=[],
    )
    brand_voice = BrandVoiceProfile(
        tone="friendly",
        banned_terms=[],
        required_disclaimers=[],
        approved_offers=[],
        sitelinks=[{"text": "Menu", "url": "https://example.com/menu", "description": None}],
    )
    result = attach_sitelinks(plan, brand_voice)
    assert len(result.sitelinks) == 1
    assert result.sitelinks[0].text == "Menu"
    assert result.sitelinks[0].url == "https://example.com/menu"


def test_attach_sitelinks_noop_without_brand_voice():
    plan = GoogleCampaignPlan(
        campaign_name="Test",
        daily_budget_micros=1_000_000,
        final_url="https://example.com",
        ad_groups=[],
        sitelinks=[],
    )
    result = attach_sitelinks(plan, None)
    assert result.sitelinks == []
