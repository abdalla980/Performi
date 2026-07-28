import json
from types import SimpleNamespace

from app.models.brand_voice import BrandVoiceProfile
from app.schemas.campaign_ir import AdCopyVariant, AudienceSegment, CampaignIR, KeywordEntry
from app.services.guardrails import run_rule_checks, run_semantic_check
from tests.ir_fixtures import make_campaign_ir


class FakeAnthropicClient:
    def __init__(self, response_text: str):
        self._response_text = response_text
        self.last_kwargs: dict | None = None

    class _Messages:
        def __init__(self, outer):
            self._outer = outer

        def create(self, **kwargs):
            self._outer.last_kwargs = kwargs
            return SimpleNamespace(content=[SimpleNamespace(text=self._outer._response_text)])

    @property
    def messages(self):
        return FakeAnthropicClient._Messages(self)


def _ir(daily_budget_usd=16.5, headline="Fresh Pastries Daily") -> CampaignIR:
    return make_campaign_ir(
        daily_budget_usd=daily_budget_usd,
        audience_segments=[
            AudienceSegment(
                name="Primary",
                description="Adults 25-54 near Austin",
                keywords=[KeywordEntry(text="bakery near me")],
                ad_copy=[AdCopyVariant(headline=headline, description="Visit today.")],
            )
        ],
    )


def test_rule_checks_flags_banned_term_and_extreme_budget():
    brand_voice = BrandVoiceProfile(
        client_id=None, tone="warm", banned_terms=["cheap"], required_disclaimers=[], approved_offers=[]
    )
    ir = _ir(daily_budget_usd=50_000, headline="Cheap Pastries Daily")

    flags = run_rule_checks(ir, brand_voice)

    codes = {f.code for f in flags}
    assert "banned_term" in codes
    assert "budget_out_of_range" in codes
    assert all(f.severity == "block" for f in flags if f.code in {"banned_term", "budget_out_of_range"})


def test_rule_checks_passes_clean_campaign():
    brand_voice = BrandVoiceProfile(
        client_id=None, tone="warm", banned_terms=["cheap"], required_disclaimers=[], approved_offers=[]
    )
    flags = run_rule_checks(_ir(), brand_voice)
    assert flags == []


def test_rule_checks_flags_keyword_overlapping_negative_keywords():
    ir = make_campaign_ir(
        audience_segments=[
            AudienceSegment(
                name="Primary",
                description="Adults 25-54 near Austin",
                keywords=[KeywordEntry(text="bakery near me"), KeywordEntry(text="cheap bakery")],
                ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
            )
        ],
        negative_keywords=["Cheap Bakery"],
    )

    flags = run_rule_checks(ir, brand_voice=None)

    codes = {f.code for f in flags}
    assert "keyword_overlaps_negative" in codes
    assert all(f.severity == "warn" for f in flags if f.code == "keyword_overlaps_negative")


def test_rule_checks_warns_on_empty_segment_ad_copy():
    ir = make_campaign_ir(
        audience_segments=[
            AudienceSegment(
                name="Empty",
                description="No ads",
                keywords=[KeywordEntry(text="bakery near me")],
                ad_copy=[],
            )
        ]
    )

    flags = run_rule_checks(ir, brand_voice=None)

    assert any(f.code == "empty_segment_ad_copy" for f in flags)


def test_rule_checks_warns_on_unverified_extensions():
    from app.models.brief import Brief

    ir = make_campaign_ir(callouts=["24/7 Support"], structured_snippets={"Services": ["Repair"]})
    brief = Brief(
        client_id=None,
        business_description="Plumbing",
        budget_usd=500,
        goals="Leads",
        trust_signals=[],
        services_offered=[],
    )

    flags = run_rule_checks(ir, brand_voice=None, brief=brief)
    codes = {f.code for f in flags}
    assert "unverified_callouts" in codes
    assert "unverified_structured_snippets" in codes


def test_rule_checks_skips_unverified_flags_when_facts_provided():
    from app.models.brief import Brief

    ir = make_campaign_ir(callouts=["Licensed & Insured"], structured_snippets={"Services": ["Repair"]})
    brief = Brief(
        client_id=None,
        business_description="Plumbing",
        budget_usd=500,
        goals="Leads",
        trust_signals=["Licensed & Insured"],
        services_offered=["Repair"],
    )

    flags = run_rule_checks(ir, brand_voice=None, brief=brief)
    codes = {f.code for f in flags}
    assert "unverified_callouts" not in codes
    assert "unverified_structured_snippets" not in codes
    fake_response = json.dumps(
        {"flags": [{"severity": "warn", "code": "off_brand_tone", "message": "Too casual for this client."}]}
    )
    fake_client = FakeAnthropicClient(fake_response)

    flags = run_semantic_check(_ir(), brand_voice=None, anthropic_client=fake_client)

    assert len(flags) == 1
    assert flags[0].code == "off_brand_tone"
    assert flags[0].severity == "warn"


def test_semantic_check_requests_enough_tokens_for_a_full_campaign_review():
    """Real incident: a CampaignIR with multiple audience segments (each carrying its
    own keywords/ad copy/interests) plus callouts/structured snippets is now much
    larger than the single-segment shape this was written against. max_tokens=512 was
    too tight -- Claude's real review response got cut off mid-JSON, raising
    JSONDecodeError, which (unhandled) surfaced to the browser as generic "Failed to
    fetch". generate_campaign_ir (llm_generation.py) already uses max_tokens=2048 for
    the same underlying reason; this call site must match it."""
    fake_client = FakeAnthropicClient(json.dumps({"flags": []}))

    run_semantic_check(_ir(), brand_voice=None, anthropic_client=fake_client)

    assert fake_client.last_kwargs["max_tokens"] == 2048


def test_semantic_check_strips_markdown_json_fence():
    fenced_response = (
        "```json\n"
        + json.dumps({"flags": [{"severity": "warn", "code": "off_brand_tone", "message": "Too casual."}]})
        + "\n```"
    )
    fake_client = FakeAnthropicClient(fenced_response)

    flags = run_semantic_check(_ir(), brand_voice=None, anthropic_client=fake_client)

    assert len(flags) == 1
    assert flags[0].code == "off_brand_tone"
