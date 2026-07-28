from app.schemas.campaign_ir import AdCopyVariant, AudienceSegment, CampaignIR, KeywordEntry


def make_campaign_ir(**overrides) -> CampaignIR:
    base = dict(
        campaign_name="Austin Bakery Foot Traffic",
        objective="traffic",
        daily_budget_usd=16.5,
        audience_segments=[
            AudienceSegment(
                name="Primary",
                description="Adults 25-54 near Austin",
                keywords=[KeywordEntry(text="bakery near me"), KeywordEntry(text="austin pastries")],
                ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
            )
        ],
        call_to_action="Visit Us Today",
    )
    base.update(overrides)
    return CampaignIR(**base)


def make_campaign_ir_json(**overrides) -> dict:
    """LLM/API JSON shape for tests."""
    base = {
        "campaign_name": "Austin Bakery Foot Traffic",
        "objective": "traffic",
        "daily_budget_usd": 16.5,
        "end_date": None,
        "audience_segments": [
            {
                "name": "Primary",
                "description": "Adults 25-54 within 5 miles of Austin bakery",
                "keywords": [{"text": "bakery near me", "match_type": "phrase"}],
                "ad_copy": [{"headline": "Fresh Pastries Daily", "description": "Visit today."}],
            }
        ],
        "call_to_action": "Visit Us Today",
    }
    base.update(overrides)
    return base
