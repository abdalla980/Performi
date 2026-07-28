import pytest

from app.config import get_settings
from app.schemas.meta_plan import MetaAdSet, MetaCampaignPlan, MetaCreative
from app.services.meta_ads_client import RealMetaAdsPushClient


class _Recorder:
    def __init__(self):
        self.calls = []

    def record(self, name, params):
        self.calls.append((name, params))


def _plan(objective="traffic", **overrides) -> MetaCampaignPlan:
    defaults = dict(
        campaign_name="Austin Bakery",
        objective=objective,
        website_url="https://example.com/bakery",
        ad_sets=[
            MetaAdSet(
                name="Primary",
                daily_budget_cents=1650,
                targeting_description="Adults 25-54 near Austin",
                creatives=[
                    MetaCreative(
                        headline="Fresh Pastries Daily",
                        body="Visit today.",
                        call_to_action="Visit Us Today",
                    )
                ],
            )
        ],
    )
    defaults.update(overrides)
    return MetaCampaignPlan(**defaults)


@pytest.fixture
def meta_configured(monkeypatch):
    monkeypatch.setenv("META_PAGE_ID", "page-123")
    monkeypatch.setenv("META_APP_ID", "app-123")
    monkeypatch.setenv("META_APP_SECRET", "secret-123")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _patch_sdk(monkeypatch, recorder: _Recorder):
    from facebook_business.adobjects.ad import Ad
    from facebook_business.adobjects.adaccount import AdAccount
    from facebook_business.adobjects.adcreative import AdCreative
    from facebook_business.adobjects.adset import AdSet
    from facebook_business.adobjects.campaign import Campaign
    from facebook_business.api import FacebookAdsApi

    monkeypatch.setattr(FacebookAdsApi, "init", lambda *a, **k: None)

    def fake_create_campaign(self, fields=None, params=None, **kwargs):
        recorder.record("create_campaign", params)
        return {Campaign.Field.id: "camp-1"}

    def fake_create_ad_set(self, fields=None, params=None, **kwargs):
        recorder.record("create_ad_set", params)
        return {AdSet.Field.id: "adset-1"}

    def fake_create_ad_creative(self, fields=None, params=None, **kwargs):
        recorder.record("create_ad_creative", params)
        return {AdCreative.Field.id: "creative-1"}

    def fake_create_ad(self, fields=None, params=None, **kwargs):
        recorder.record("create_ad", params)
        return {Ad.Field.id: "ad-1"}

    monkeypatch.setattr(AdAccount, "create_campaign", fake_create_campaign)
    monkeypatch.setattr(AdAccount, "create_ad_set", fake_create_ad_set)
    monkeypatch.setattr(AdAccount, "create_ad_creative", fake_create_ad_creative)
    monkeypatch.setattr(AdAccount, "create_ad", fake_create_ad)


def test_push_creates_campaign_adset_creative_and_ad_for_traffic(monkeypatch, meta_configured):
    recorder = _Recorder()
    _patch_sdk(monkeypatch, recorder)
    from facebook_business.adobjects.campaign import Campaign

    result = RealMetaAdsPushClient().push(_plan(), access_token="tok", ad_account_id="act_1")

    assert result == "camp-1"
    calls = dict(recorder.calls)

    assert calls["create_campaign"][Campaign.Field.objective] == Campaign.Objective.outcome_traffic
    assert calls["create_campaign"][Campaign.Field.status] == Campaign.Status.paused

    from facebook_business.adobjects.adset import AdSet

    ad_set_params = calls["create_ad_set"]
    assert ad_set_params[AdSet.Field.campaign_id] == "camp-1"
    assert ad_set_params[AdSet.Field.daily_budget] == 1650
    assert ad_set_params[AdSet.Field.optimization_goal] == AdSet.OptimizationGoal.link_clicks
    assert ad_set_params[AdSet.Field.targeting]["geo_locations"] == {"countries": ["US"]}

    from facebook_business.adobjects.adcreative import AdCreative

    creative_params = calls["create_ad_creative"]
    link_data = creative_params[AdCreative.Field.object_story_spec]["link_data"]
    assert link_data["link"] == "https://example.com/bakery"
    assert creative_params[AdCreative.Field.object_story_spec]["page_id"] == "page-123"
    assert link_data["name"] == "Fresh Pastries Daily"
    assert link_data["message"] == "Visit today."

    from facebook_business.adobjects.ad import Ad

    ad_params = calls["create_ad"]
    assert ad_params[Ad.Field.adset_id] == "adset-1"
    assert ad_params[Ad.Field.creative] == {"creative_id": "creative-1"}


def test_push_supports_awareness_objective(monkeypatch, meta_configured):
    recorder = _Recorder()
    _patch_sdk(monkeypatch, recorder)
    from facebook_business.adobjects.campaign import Campaign
    from facebook_business.adobjects.adset import AdSet

    RealMetaAdsPushClient().push(_plan(objective="awareness"), access_token="tok", ad_account_id="act_1")

    calls = dict(recorder.calls)
    assert calls["create_campaign"][Campaign.Field.objective] == Campaign.Objective.outcome_awareness
    assert calls["create_ad_set"][AdSet.Field.optimization_goal] == AdSet.OptimizationGoal.reach


@pytest.mark.parametrize("objective", ["leads", "sales"])
def test_push_rejects_unsupported_objectives(monkeypatch, meta_configured, objective):
    recorder = _Recorder()
    _patch_sdk(monkeypatch, recorder)

    with pytest.raises(ValueError, match="Pixel or Lead Form ID"):
        RealMetaAdsPushClient().push(_plan(objective=objective), access_token="tok", ad_account_id="act_1")

    assert recorder.calls == []


def test_push_raises_when_page_id_missing(monkeypatch):
    monkeypatch.setenv("META_PAGE_ID", "")
    get_settings.cache_clear()
    recorder = _Recorder()
    _patch_sdk(monkeypatch, recorder)

    try:
        with pytest.raises(ValueError, match="META_PAGE_ID"):
            RealMetaAdsPushClient().push(_plan(), access_token="tok", ad_account_id="act_1")
        assert recorder.calls == []
    finally:
        get_settings.cache_clear()
