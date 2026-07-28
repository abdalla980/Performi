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
        "daily_budget_usd, end_date (YYYY-MM-DD or null), audience_segments (1-3 objects with "
        "name, description, optional age_min/age_max, interests (list of strings), "
        "keywords (list of {text, match_type} where match_type is exact/phrase/broad), "
        "ad_copy (list of {headline, description}, 2+ per segment recommended)), "
        "call_to_action, callouts (3-10 short trust phrases), "
        "structured_snippets (object mapping header strings to value lists)."
    )


def strip_markdown_json_fence(text: str) -> str:
    """Claude sometimes wraps JSON output in a ```json ... ``` fence despite being
    told to return JSON only — strip it so json.loads/model_validate_json don't choke."""
    text = text.strip()
    if text.startswith("```"):
        first_newline = text.find("\n")
        text = text[first_newline + 1 :] if first_newline != -1 else text
    text = text.strip()
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def generate_campaign_ir(
    brief: Brief, anthropic_client, brand_voice: BrandVoiceProfile | None = None
) -> CampaignIR:
    settings = get_settings()
    prompt = _build_prompt(brief, brand_voice)
    response = anthropic_client.messages.create(
        model=settings.anthropic_model,
        max_tokens=2048,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    # Extended-thinking-enabled responses put a ThinkingBlock (no .text attribute)
    # ahead of the actual text block in response.content — skip past it rather than
    # assuming content[0] is always text.
    raw_text = next(block.text for block in response.content if hasattr(block, "text"))
    ir = CampaignIR.model_validate_json(strip_markdown_json_fence(raw_text))

    # Facts, not creative content — trust the brief over whatever the model produced.
    if brief.end_date is not None:
        ir.end_date = brief.end_date
    ir.website_url = brief.website_url
    ir.negative_keywords = list(brief.excluded_keywords or [])
    return ir
