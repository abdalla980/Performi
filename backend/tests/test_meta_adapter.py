from app.schemas.campaign_ir import AdCopyVariant, AudienceSegment, CampaignIR, KeywordEntry
from app.services.meta_adapter import adapt_to_meta


def test_adapt_to_meta_converts_budget_and_creative():
    ir = CampaignIR(
        campaign_name="Austin Bakery Foot Traffic",
        objective="traffic",
        daily_budget_usd=16.5,
        audience_segments=[
            AudienceSegment(
                name="Primary",
                description="Adults 25-54 near Austin",
                keywords=[KeywordEntry(text="bakery near me")],
                ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
            )
        ],
        call_to_action="Visit Us Today",
    )

    plan = adapt_to_meta(ir)

    assert plan.campaign_name == "Austin Bakery Foot Traffic"
    assert plan.objective == "traffic"
    assert len(plan.ad_sets) == 1
    assert plan.ad_sets[0].daily_budget_cents == 1650
    assert plan.ad_sets[0].targeting_description == "Adults 25-54 near Austin"
    assert plan.ad_sets[0].creatives[0].headline == "Fresh Pastries Daily"


def test_adapt_to_meta_keeps_all_ad_copy_variants():
    ir = CampaignIR(
        campaign_name="Austin Bakery Foot Traffic",
        objective="traffic",
        daily_budget_usd=16.5,
        audience_segments=[
            AudienceSegment(
                name="Primary",
                description="Adults 25-54 near Austin",
                keywords=[KeywordEntry(text="bakery near me")],
                ad_copy=[
                    AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today."),
                    AdCopyVariant(headline="Sourdough Fresh Daily", description="Open until 6."),
                ],
            )
        ],
        call_to_action="Visit Us Today",
    )

    plan = adapt_to_meta(ir)

    assert len(plan.ad_sets[0].creatives) == 2
    assert plan.ad_sets[0].creatives[1].headline == "Sourdough Fresh Daily"


def test_adapt_to_meta_carries_website_url():
    ir = CampaignIR(
        campaign_name="Austin Bakery Foot Traffic",
        objective="traffic",
        daily_budget_usd=16.5,
        audience_segments=[
            AudienceSegment(
                name="Primary",
                description="Adults 25-54 near Austin",
                keywords=[KeywordEntry(text="bakery near me")],
                ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
            )
        ],
        call_to_action="Visit Us Today",
        website_url="https://acmebakery.test",
    )

    plan = adapt_to_meta(ir)

    assert plan.website_url == "https://acmebakery.test"
