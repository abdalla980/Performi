import json

from app.config import get_settings
from app.models.brand_voice import BrandVoiceProfile
from app.schemas.campaign_ir import CampaignIR
from app.schemas.guardrail import GuardrailFlag

_MIN_DAILY_BUDGET_USD = 1.0
_MAX_DAILY_BUDGET_USD = 10_000.0

_SEMANTIC_SYSTEM_PROMPT = (
    "You review an ad campaign for brand-voice fit. Return strict JSON: "
    '{"flags": [{"severity": "block"|"warn", "code": str, "message": str}]}. '
    "Return an empty flags list if nothing is wrong. No prose outside the JSON."
)


def run_rule_checks(ir: CampaignIR, brand_voice: BrandVoiceProfile | None) -> list[GuardrailFlag]:
    flags: list[GuardrailFlag] = []

    if not (_MIN_DAILY_BUDGET_USD <= ir.daily_budget_usd <= _MAX_DAILY_BUDGET_USD):
        flags.append(
            GuardrailFlag(
                severity="block",
                code="budget_out_of_range",
                message=(
                    f"Daily budget ${ir.daily_budget_usd:,.2f} is outside the sane range "
                    f"(${_MIN_DAILY_BUDGET_USD:.0f}-${_MAX_DAILY_BUDGET_USD:,.0f})."
                ),
            )
        )

    if brand_voice:
        haystack = " ".join(
            [ir.campaign_name, *[c.headline + " " + c.description for c in ir.ad_copy]]
        ).lower()
        for banned in brand_voice.banned_terms:
            if banned.lower() in haystack:
                flags.append(
                    GuardrailFlag(
                        severity="block",
                        code="banned_term",
                        message=f"Generated copy contains banned term '{banned}'.",
                    )
                )

    negative_keywords = {keyword.lower() for keyword in ir.negative_keywords}
    overlap = sorted({keyword for keyword in ir.keywords if keyword.lower() in negative_keywords})
    if overlap:
        flags.append(
            GuardrailFlag(
                severity="warn",
                code="keyword_overlaps_negative",
                message=f"Generated keyword(s) {', '.join(overlap)} overlap with excluded/negative keywords.",
            )
        )

    return flags


def run_semantic_check(
    ir: CampaignIR, brand_voice: BrandVoiceProfile | None, anthropic_client
) -> list[GuardrailFlag]:
    settings = get_settings()
    tone = brand_voice.tone if brand_voice else "neutral, professional"
    prompt = (
        f"Required tone: {tone}\n"
        f"Campaign: {ir.model_dump_json()}\n"
        "Does the ad copy match the required tone and stay on-topic for the audience described? "
        "Flag anything that doesn't."
    )
    response = anthropic_client.messages.create(
        model=settings.anthropic_model,
        max_tokens=512,
        system=_SEMANTIC_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    parsed = json.loads(response.content[0].text)
    return [GuardrailFlag.model_validate(f) for f in parsed["flags"]]
