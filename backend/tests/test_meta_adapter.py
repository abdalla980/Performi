from app.schemas.campaign_ir import AdCopyVariant, CampaignIR
from app.services.meta_adapter import adapt_to_meta


def test_adapt_to_meta_converts_budget_and_creative():
    ir = CampaignIR(
        campaign_name="Austin Bakery Foot Traffic",
        objective="traffic",
        daily_budget_usd=16.5,
        keywords=["bakery near me"],
        audience_description="Adults 25-54 near Austin",
        ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
        call_to_action="Visit Us Today",
    )

    plan = adapt_to_meta(ir)

    assert plan.campaign_name == "Austin Bakery Foot Traffic"
    assert plan.objective == "traffic"
    assert len(plan.ad_sets) == 1
    assert plan.ad_sets[0].daily_budget_cents == 1650
    assert plan.ad_sets[0].targeting_description == "Adults 25-54 near Austin"
    assert plan.ad_sets[0].creative_headline == "Fresh Pastries Daily"


def test_adapt_to_meta_carries_website_url():
    ir = CampaignIR(
        campaign_name="Austin Bakery Foot Traffic",
        objective="traffic",
        daily_budget_usd=16.5,
        keywords=["bakery near me"],
        audience_description="Adults 25-54 near Austin",
        ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
        call_to_action="Visit Us Today",
        website_url="https://acmebakery.test",
    )

    plan = adapt_to_meta(ir)

    assert plan.website_url == "https://acmebakery.test"
