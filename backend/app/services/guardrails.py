import json

from app.config import get_settings
from app.models.brand_voice import BrandVoiceProfile
from app.models.brief import Brief
from app.schemas.campaign_ir import CampaignIR
from app.schemas.guardrail import GuardrailFlag
from app.services.llm_generation import strip_markdown_json_fence

_MIN_DAILY_BUDGET_USD = 1.0
_MAX_DAILY_BUDGET_USD = 10_000.0

_SEMANTIC_SYSTEM_PROMPT = (
    "You review an ad campaign for brand-voice fit. Return strict JSON: "
    '{"flags": [{"severity": "block"|"warn", "code": str, "message": str}]}. '
    "Return an empty flags list if nothing is wrong. No prose outside the JSON."
)


def run_rule_checks(
    ir: CampaignIR,
    brand_voice: BrandVoiceProfile | None,
    brief: Brief | None = None,
) -> list[GuardrailFlag]:
    flags: list[GuardrailFlag] = []
    all_ad_copy = [copy for segment in ir.audience_segments for copy in segment.ad_copy]
    all_keywords = [kw.text for segment in ir.audience_segments for kw in segment.keywords]

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

    for segment in ir.audience_segments:
        if not segment.ad_copy:
            flags.append(
                GuardrailFlag(
                    severity="warn",
                    code="empty_segment_ad_copy",
                    message=f"Audience segment '{segment.name}' has no ad copy variants.",
                )
            )

    if brand_voice:
        haystack = " ".join(
            [ir.campaign_name, *[c.headline + " " + c.description for c in all_ad_copy]]
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
    overlap = sorted({keyword for keyword in all_keywords if keyword.lower() in negative_keywords})
    if overlap:
        flags.append(
            GuardrailFlag(
                severity="warn",
                code="keyword_overlaps_negative",
                message=f"Generated keyword(s) {', '.join(overlap)} overlap with excluded/negative keywords.",
            )
        )

    trust_signals = (brief.trust_signals if brief else None) or []
    services_offered = (brief.services_offered if brief else None) or []
    if ir.callouts and not trust_signals:
        flags.append(
            GuardrailFlag(
                severity="warn",
                code="unverified_callouts",
                message=(
                    "Callouts were AI-generated, not agency-provided — verify these claims "
                    "are accurate before approving."
                ),
            )
        )
    if ir.structured_snippets and not services_offered:
        flags.append(
            GuardrailFlag(
                severity="warn",
                code="unverified_structured_snippets",
                message=(
                    "Structured snippets were AI-generated, not agency-provided — verify "
                    "these are real services before approving."
                ),
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
        # Matches generate_campaign_ir's max_tokens (llm_generation.py) -- the IR being
        # reviewed here can be just as large (multiple audience segments, each with its
        # own keywords/ad copy/interests, plus callouts/structured snippets), so the
        # review response needs the same headroom or it gets truncated mid-JSON.
        max_tokens=2048,
        system=_SEMANTIC_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    # See llm_generation.py's generate_campaign_ir for why content[0] isn't safe to
    # assume is text (extended-thinking responses put a ThinkingBlock first).
    raw_text = next(block.text for block in response.content if hasattr(block, "text"))
    payload = json.loads(strip_markdown_json_fence(raw_text))
    return [GuardrailFlag.model_validate(f) for f in payload.get("flags", [])]
