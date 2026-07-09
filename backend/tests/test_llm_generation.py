import json
from types import SimpleNamespace

from app.models.brand_voice import BrandVoiceProfile
from app.models.brief import Brief
from app.services.llm_generation import generate_campaign_ir


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
    fake_response = json.dumps(
        {
            "campaign_name": "Austin Bakery Foot Traffic",
            "objective": "traffic",
            "daily_budget_usd": 16.5,
            "end_date": None,
            "keywords": ["bakery near me", "austin pastries"],
            "audience_description": "Adults 25-54 within 5 miles of Austin bakery",
            "ad_copy": [
                {"headline": "Fresh Pastries Daily", "description": "Visit our Austin bakery today."}
            ],
            "call_to_action": "Visit Us Today",
        }
    )
    fake_client = FakeAnthropicClient(fake_response)

    ir = generate_campaign_ir(brief, anthropic_client=fake_client)

    assert ir.campaign_name == "Austin Bakery Foot Traffic"
    assert ir.keywords == ["bakery near me", "austin pastries"]
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
    fake_response = json.dumps(
        {
            "campaign_name": "Austin Bakery Foot Traffic",
            "objective": "traffic",
            "daily_budget_usd": 16.5,
            "end_date": None,
            "keywords": ["bakery near me"],
            "audience_description": "Adults 25-54 within 5 miles of Austin bakery",
            "ad_copy": [{"headline": "Fresh Pastries Daily", "description": "Visit today."}],
            "call_to_action": "Visit Us Today",
        }
    )
    fake_client = FakeAnthropicClient(fake_response)

    generate_campaign_ir(brief, anthropic_client=fake_client, brand_voice=brand_voice)

    prompt = fake_client.last_prompt["messages"][0]["content"]
    assert "warm, community-focused" in prompt
    assert "cheap" in prompt
    assert "Free coffee with pastry purchase" in prompt
