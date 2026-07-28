import json
from types import SimpleNamespace

from app.models.brand_voice import BrandVoiceProfile
from app.models.brief import Brief
from app.services.llm_generation import generate_campaign_ir
from tests.ir_fixtures import make_campaign_ir_json


class FakeAnthropicClient:
    def __init__(self, response_text: str):
        self._response_text = response_text
        self.last_prompt = None

    class _Messages:
        def __init__(self, outer):
            self._outer = outer

        def create(self, **kwargs):
            self._outer.last_prompt = kwargs
            return SimpleNamespace(content=[SimpleNamespace(text=self._outer._response_text)])

    @property
    def messages(self):
        return FakeAnthropicClient._Messages(self)


def test_generate_campaign_ir_parses_model_output():
    brief = Brief(
        client_id=None,
        business_description="Local bakery in Austin",
        budget_usd=500,
        goals="Drive foot traffic",
    )
    payload = make_campaign_ir_json(
        audience_segments=[
            {
                "name": "Primary",
                "description": "Adults 25-54 within 5 miles of Austin bakery",
                "keywords": [
                    {"text": "bakery near me", "match_type": "phrase"},
                    {"text": "austin pastries", "match_type": "phrase"},
                ],
                "ad_copy": [{"headline": "Fresh Pastries Daily", "description": "Visit our Austin bakery today."}],
            }
        ],
    )
    fake_client = FakeAnthropicClient(json.dumps(payload))

    ir = generate_campaign_ir(brief, anthropic_client=fake_client)

    assert ir.campaign_name == "Austin Bakery Foot Traffic"
    assert [k.text for k in ir.audience_segments[0].keywords] == ["bakery near me", "austin pastries"]
    assert "Local bakery in Austin" in fake_client.last_prompt["messages"][0]["content"]


def test_generate_campaign_ir_includes_brand_voice_in_prompt():
    brief = Brief(
        client_id=None,
        business_description="Local bakery in Austin",
        budget_usd=500,
        goals="Drive foot traffic",
    )
    brand_voice = BrandVoiceProfile(
        client_id=None,
        tone="warm, community-focused",
        banned_terms=["cheap"],
        required_disclaimers=[],
        approved_offers=["Free coffee with pastry purchase"],
    )
    fake_client = FakeAnthropicClient(json.dumps(make_campaign_ir_json()))

    generate_campaign_ir(brief, anthropic_client=fake_client, brand_voice=brand_voice)

    prompt = fake_client.last_prompt["messages"][0]["content"]
    assert "warm, community-focused" in prompt
    assert "cheap" in prompt
    assert "Free coffee with pastry purchase" in prompt


def test_generate_campaign_ir_includes_new_brief_details_in_prompt():
    brief = Brief(
        client_id=None,
        business_description="Local bakery in Austin",
        budget_usd=500,
        goals="Drive foot traffic",
        target_location="Austin, TX",
        target_audience="Families within 5 miles",
        competitors="Big Bakery Co",
        unique_selling_points="Family recipes since 1990",
        excluded_keywords=["free", "cheap"],
    )
    fake_client = FakeAnthropicClient(json.dumps(make_campaign_ir_json()))

    generate_campaign_ir(brief, anthropic_client=fake_client)

    prompt = fake_client.last_prompt["messages"][0]["content"]
    assert "Austin, TX" in prompt
    assert "Families within 5 miles" in prompt
    assert "Big Bakery Co" in prompt
    assert "Family recipes since 1990" in prompt
    assert "free" in prompt
    assert "cheap" in prompt


def test_generate_campaign_ir_strips_markdown_json_fence():
    brief = Brief(
        client_id=None,
        business_description="Local bakery in Austin",
        budget_usd=500,
        goals="Drive foot traffic",
    )
    fenced_response = "```json\n" + json.dumps(make_campaign_ir_json()) + "\n```"
    fake_client = FakeAnthropicClient(fenced_response)

    ir = generate_campaign_ir(brief, anthropic_client=fake_client)

    assert ir.campaign_name == "Austin Bakery Foot Traffic"


def test_generate_campaign_ir_overrides_facts_from_brief():
    from datetime import date

    brief = Brief(
        client_id=None,
        business_description="Local bakery in Austin",
        budget_usd=500,
        goals="Drive foot traffic",
        website_url="https://acmebakery.test",
        end_date=date(2026, 12, 31),
        excluded_keywords=["free", "cheap"],
    )
    fake_client = FakeAnthropicClient(json.dumps(make_campaign_ir_json(end_date="2099-01-01")))

    ir = generate_campaign_ir(brief, anthropic_client=fake_client)

    assert ir.end_date == date(2026, 12, 31)
    assert ir.website_url == "https://acmebakery.test"
    assert ir.negative_keywords == ["free", "cheap"]
