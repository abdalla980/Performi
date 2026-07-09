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
