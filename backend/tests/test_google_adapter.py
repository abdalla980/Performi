from app.schemas.campaign_ir import AdCopyVariant, AudienceSegment, CampaignIR, KeywordEntry
from app.services.google_adapter import adapt_to_google


def test_adapt_to_google_emits_one_ad_group_per_segment():
    ir = CampaignIR(
        campaign_name="Austin Bakery Foot Traffic",
        objective="traffic",
        daily_budget_usd=16.5,
        audience_segments=[
            AudienceSegment(
                name="Locals",
                description="Adults 25-54 near Austin",
                keywords=[KeywordEntry(text="bakery near me"), KeywordEntry(text="austin pastries")],
                ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
            ),
            AudienceSegment(
                name="Tourists",
                description="Visitors looking for dessert",
                keywords=[KeywordEntry(text="best bakery austin")],
                ad_copy=[AdCopyVariant(headline="Try Austin's Best Bakery", description="Walk-ins welcome.")],
            ),
        ],
        call_to_action="Visit Us Today",
    )

    plan = adapt_to_google(ir)

    assert plan.campaign_name == "Austin Bakery Foot Traffic"
    assert plan.daily_budget_micros == 16_500_000
    assert len(plan.ad_groups) == 2
    assert plan.ad_groups[0].name == "Austin Bakery Foot Traffic - Locals"
    assert [k.text for k in plan.ad_groups[0].keywords] == ["bakery near me", "austin pastries"]
    assert all(k.match_type == "phrase" for k in plan.ad_groups[0].keywords)
    assert "Fresh Pastries Daily" in plan.ad_groups[0].headlines


def test_adapt_to_google_carries_final_url_and_negative_keywords():
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
        negative_keywords=["free", "cheap"],
    )

    plan = adapt_to_google(ir)

    assert plan.final_url == "https://acmebakery.test"
    assert plan.negative_keywords == ["free", "cheap"]
