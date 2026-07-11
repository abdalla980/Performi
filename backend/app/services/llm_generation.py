from app.config import get_settings
from app.models.brand_voice import BrandVoiceProfile
from app.models.brief import Brief
from app.schemas.campaign_ir import CampaignIR

_SYSTEM_PROMPT = (
    "You generate a single Google Ads campaign as strict JSON matching the given schema. "
    "Never use banned terms. Respect the required tone. Output JSON only, no prose."
)


def _build_prompt(brief: Brief, brand_voice: BrandVoiceProfile | None) -> str:
    tone = brand_voice.tone if brand_voice else "neutral, professional"
    banned = ", ".join(brand_voice.banned_terms) if brand_voice and brand_voice.banned_terms else "(none)"
    disclaimers = (
        ", ".join(brand_voice.required_disclaimers)
        if brand_voice and brand_voice.required_disclaimers
        else "(none)"
    )
    offers = ", ".join(brand_voice.approved_offers) if brand_voice and brand_voice.approved_offers else "(none)"
    excluded_keywords = ", ".join(brief.excluded_keywords) if brief.excluded_keywords else "(none)"
    return (
        f"Business description: {brief.business_description}\n"
        f"Daily/total budget in USD: {brief.budget_usd}\n"
        f"Goals: {brief.goals}\n"
        f"Target location: {brief.target_location or '(not specified)'}\n"
        f"Target audience: {brief.target_audience or '(not specified)'}\n"
        f"Competitors to differentiate from: {brief.competitors or '(none)'}\n"
        f"Unique selling points: {brief.unique_selling_points or '(none)'}\n"
        f"Excluded/negative keywords (never propose these as target keywords): {excluded_keywords}\n"
        f"Required tone: {tone}\n"
        f"Banned terms (never use): {banned}\n"
        f"Required disclaimers: {disclaimers}\n"
        f"Currently approved offers: {offers}\n"
        "Return JSON with keys: campaign_name, objective (one of leads/sales/traffic/awareness), "
        "daily_budget_usd, end_date (YYYY-MM-DD or null), keywords (list of strings), "
        "audience_description, ad_copy (list of {headline, description}), call_to_action."
    )


def generate_campaign_ir(
    brief: Brief, anthropic_client, brand_voice: BrandVoiceProfile | None = None
) -> CampaignIR:
    settings = get_settings()
    prompt = _build_prompt(brief, brand_voice)
    response = anthropic_client.messages.create(
        model=settings.anthropic_model,
        max_tokens=1024,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    raw_text = response.content[0].text
    ir = CampaignIR.model_validate_json(raw_text)

    # Facts, not creative content — trust the brief over whatever the model produced.
    if brief.end_date is not None:
        ir.end_date = brief.end_date
    ir.website_url = brief.website_url
    ir.negative_keywords = list(brief.excluded_keywords or [])
    return ir
