from app.schemas.campaign_ir import AdCopyVariant, CampaignIR
from app.services.google_adapter import adapt_to_google


def test_adapt_to_google_converts_budget_and_groups_keywords():
    ir = CampaignIR(
        campaign_name="Austin Bakery Foot Traffic",
        objective="traffic",
        daily_budget_usd=16.5,
        keywords=["bakery near me", "austin pastries"],
        audience_description="Adults 25-54 near Austin",
        ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
        call_to_action="Visit Us Today",
    )

    plan = adapt_to_google(ir)

    assert plan.campaign_name == "Austin Bakery Foot Traffic"
    assert plan.daily_budget_micros == 16_500_000
    assert len(plan.ad_groups) == 1
    assert plan.ad_groups[0].keywords == ["bakery near me", "austin pastries"]
    assert "Fresh Pastries Daily" in plan.ad_groups[0].headlines
