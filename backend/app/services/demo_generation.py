import re
from typing import Literal

from app.models.brand_voice import BrandVoiceProfile
from app.models.brief import Brief
from app.schemas.campaign_ir import AdCopyVariant, CampaignIR

_LEADS_TERMS = ("lead", "call", "book", "appointment", "quote", "consult")
_SALES_TERMS = ("sale", "purchase", "buy", "order", "revenue")
_TRAFFIC_TERMS = ("traffic", "visit", "store", "foot")

_CTA_BY_OBJECTIVE = {
    "leads": "Book Now",
    "sales": "Shop Now",
    "traffic": "Visit Us Today",
    "awareness": "Learn More",
}


def _infer_objective(goals: str) -> Literal["leads", "sales", "traffic", "awareness"]:
    lowered = goals.lower()
    if any(term in lowered for term in _LEADS_TERMS):
        return "leads"
    if any(term in lowered for term in _SALES_TERMS):
        return "sales"
    if any(term in lowered for term in _TRAFFIC_TERMS):
        return "traffic"
    return "awareness"


def _strip_banned(text: str, banned_terms: list[str]) -> str:
    for term in banned_terms:
        text = re.sub(re.escape(term), "", text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip()


def _build_keywords(description: str) -> list[str]:
    words = [word for word in re.findall(r"[A-Za-z']+", description) if len(word) > 2]
    if not words:
        return ["local business", "near me"]
    keywords = [" ".join(words[:3]).lower(), f"{words[0].lower()} near me"]
    if len(words) >= 2:
        keywords.append(f"best {words[1].lower()}")
    return keywords


def generate_demo_campaign_ir(brief: Brief, brand_voice: BrandVoiceProfile | None) -> CampaignIR:
    """Deterministic, non-LLM stand-in for generate_campaign_ir — lets a pilot agency
    exercise the full generate-review-launch pipeline before an ANTHROPIC_API_KEY is
    configured (see /config/status)."""
    banned_terms = brand_voice.banned_terms if brand_voice else []
    approved_offers = brand_voice.approved_offers if brand_voice else []
    excluded_keywords = brief.excluded_keywords or []

    description = _strip_banned(brief.business_description, banned_terms)
    objective = _infer_objective(brief.goals)
    daily_budget_usd = max(1.0, min(10_000.0, round(brief.budget_usd / 30, 2)))
    cta = _CTA_BY_OBJECTIVE[objective]

    if approved_offers:
        offer_line = approved_offers[0]
    elif brief.unique_selling_points:
        offer_line = brief.unique_selling_points
    else:
        offer_line = f"Discover {description.lower()}."
    headline = description.title()[:30] or "Quality You Can Trust"
    ad_description = _strip_banned(f"{offer_line} {cta}.", banned_terms)

    audience_description = brief.target_audience or f"Prospective customers interested in {description.lower()}"
    if brief.target_location:
        audience_description = f"{audience_description} in {brief.target_location}"

    excluded_lower = {keyword.lower() for keyword in excluded_keywords}
    keywords = [keyword for keyword in _build_keywords(description) if keyword.lower() not in excluded_lower]

    return CampaignIR(
        campaign_name=_strip_banned(f"{description.title()} — {objective.title()} Campaign", banned_terms),
        objective=objective,
        daily_budget_usd=daily_budget_usd,
        end_date=brief.end_date,
        keywords=keywords or ["local business", "near me"],
        audience_description=audience_description,
        ad_copy=[AdCopyVariant(headline=headline, description=ad_description)],
        call_to_action=cta,
        website_url=brief.website_url,
        negative_keywords=list(excluded_keywords),
    )
