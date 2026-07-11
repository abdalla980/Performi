from app.models.brand_voice import BrandVoiceProfile
from app.models.brief import Brief
from app.services.demo_generation import generate_demo_campaign_ir


def test_generate_demo_campaign_ir_infers_traffic_objective_from_goals():
    brief = Brief(
        client_id=None,
        business_description="Local bakery in Austin",
        budget_usd=600,
        goals="Drive foot traffic to our storefront",
    )

    ir = generate_demo_campaign_ir(brief, brand_voice=None)

    assert ir.objective == "traffic"
    assert 1.0 <= ir.daily_budget_usd <= 10_000.0
    assert len(ir.keywords) > 0
    assert len(ir.ad_copy) >= 1


def test_generate_demo_campaign_ir_infers_leads_objective_and_uses_approved_offer():
    brief = Brief(
        client_id=None,
        business_description="Plumbing company",
        budget_usd=900,
        goals="Book more emergency service calls",
    )
    brand_voice = BrandVoiceProfile(
        client_id=None,
        tone="urgent, trustworthy",
        banned_terms=[],
        required_disclaimers=[],
        approved_offers=["$50 off first service call"],
    )

    ir = generate_demo_campaign_ir(brief, brand_voice=brand_voice)

    assert ir.objective == "leads"
    assert any("$50 off first service call" in variant.description for variant in ir.ad_copy)


def test_generate_demo_campaign_ir_never_uses_banned_terms():
    brief = Brief(
        client_id=None,
        business_description="Cheap discount furniture outlet",
        budget_usd=300,
        goals="Drive sales",
    )
    brand_voice = BrandVoiceProfile(
        client_id=None,
        tone="upscale",
        banned_terms=["cheap", "discount"],
        required_disclaimers=[],
        approved_offers=[],
    )

    ir = generate_demo_campaign_ir(brief, brand_voice=brand_voice)

    haystack = " ".join([ir.campaign_name, *[k for k in ir.keywords], *[c.headline + c.description for c in ir.ad_copy]]).lower()
    assert "cheap" not in haystack
    assert "discount" not in haystack


def test_generate_demo_campaign_ir_uses_target_audience_and_location():
    brief = Brief(
        client_id=None,
        business_description="Local bakery in Austin",
        budget_usd=600,
        goals="Drive foot traffic",
        target_audience="Families with young kids",
        target_location="Austin, TX",
    )

    ir = generate_demo_campaign_ir(brief, brand_voice=None)

    assert "Families with young kids" in ir.audience_description
    assert "Austin, TX" in ir.audience_description


def test_generate_demo_campaign_ir_excludes_negative_keywords():
    brief = Brief(
        client_id=None,
        business_description="Bakery near me",
        budget_usd=600,
        goals="Drive foot traffic",
        excluded_keywords=["bakery near me"],
    )

    ir = generate_demo_campaign_ir(brief, brand_voice=None)

    assert "bakery near me" not in [k.lower() for k in ir.keywords]
    assert ir.negative_keywords == ["bakery near me"]


def test_generate_demo_campaign_ir_passes_through_website_url_and_end_date():
    from datetime import date

    brief = Brief(
        client_id=None,
        business_description="Local bakery in Austin",
        budget_usd=600,
        goals="Drive foot traffic",
        website_url="https://acmebakery.test",
        end_date=date(2026, 12, 31),
    )

    ir = generate_demo_campaign_ir(brief, brand_voice=None)

    assert ir.website_url == "https://acmebakery.test"
    assert ir.end_date == date(2026, 12, 31)
