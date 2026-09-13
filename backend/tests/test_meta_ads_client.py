import httpx
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

    adset_counter = {"n": 0}

    def fake_create_ad_set(self, fields=None, params=None, **kwargs):
        adset_counter["n"] += 1
        recorder.record("create_ad_set", params)
        return {AdSet.Field.id: f"adset-{adset_counter['n']}"}

    creative_ids = iter([f"creative-{i}" for i in range(1, 20)])

    def fake_create_ad_creative(self, fields=None, params=None, **kwargs):
        recorder.record("create_ad_creative", params)
        return {AdCreative.Field.id: next(creative_ids)}

    def fake_create_ad(self, fields=None, params=None, **kwargs):
        recorder.record("create_ad", params)
        return {Ad.Field.id: "ad-1"}

    monkeypatch.setattr(AdAccount, "create_campaign", fake_create_campaign)
    monkeypatch.setattr(AdAccount, "create_ad_set", fake_create_ad_set)
    monkeypatch.setattr(AdAccount, "create_ad_creative", fake_create_ad_creative)
    monkeypatch.setattr(AdAccount, "create_ad", fake_create_ad)


def _patch_interest_http(monkeypatch, payload=None):
    payload = payload if payload is not None else {"data": [{"id": "6001", "name": "Bakeries"}]}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return payload

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr(httpx, "Client", FakeClient)


def test_push_creates_campaign_adset_creative_and_ad_for_traffic(monkeypatch, meta_configured):
    recorder = _Recorder()
    _patch_sdk(monkeypatch, recorder)
    _patch_interest_http(monkeypatch)
    from facebook_business.adobjects.campaign import Campaign

    result = RealMetaAdsPushClient().push(_plan(), access_token="tok", ad_account_id="act_1")

    assert result == "camp-1"
    calls = dict(recorder.calls)

    assert calls["create_campaign"][Campaign.Field.objective] == Campaign.Objective.outcome_traffic
    assert calls["create_campaign"][Campaign.Field.status] == Campaign.Status.paused
    assert calls["create_campaign"][Campaign.Field.is_adset_budget_sharing_enabled] is False

    from facebook_business.adobjects.adset import AdSet

    ad_set_params = calls["create_ad_set"]
    assert ad_set_params[AdSet.Field.campaign_id] == "camp-1"
    assert ad_set_params[AdSet.Field.daily_budget] == 1650
    assert ad_set_params[AdSet.Field.optimization_goal] == AdSet.OptimizationGoal.link_clicks
    assert ad_set_params[AdSet.Field.bid_strategy] == AdSet.BidStrategy.lowest_cost_without_cap
    assert ad_set_params[AdSet.Field.targeting]["geo_locations"] == {"countries": ["US"]}
    assert ad_set_params[AdSet.Field.targeting]["age_min"] == 18
    assert ad_set_params[AdSet.Field.targeting]["age_max"] == 65

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


def test_push_uses_segment_age_and_resolved_interests(monkeypatch, meta_configured):
    recorder = _Recorder()
    _patch_sdk(monkeypatch, recorder)
    _patch_interest_http(monkeypatch)
    from facebook_business.adobjects.adset import AdSet

    RealMetaAdsPushClient().push(
        _plan(
            ad_sets=[
                MetaAdSet(
                    name="Primary",
                    daily_budget_cents=1650,
                    targeting_description="Home bakers",
                    age_min=25,
                    age_max=54,
                    interests=["bakery"],
                    creatives=[
                        MetaCreative(headline="Fresh", body="Visit.", call_to_action="Learn More"),
                    ],
                )
            ]
        ),
        access_token="tok",
        ad_account_id="act_1",
    )

    targeting = dict(recorder.calls)["create_ad_set"][AdSet.Field.targeting]
    assert targeting["age_min"] == 25
    assert targeting["age_max"] == 54
    assert targeting["flexible_spec"] == [{"interests": [{"id": "6001", "name": "Bakeries"}]}]
    assert targeting["targeting_automation"] == {"advantage_audience": 0}


def test_push_creates_one_ad_per_creative(monkeypatch, meta_configured):
    recorder = _Recorder()
    _patch_sdk(monkeypatch, recorder)
    _patch_interest_http(monkeypatch)

    RealMetaAdsPushClient().push(
        _plan(
            ad_sets=[
                MetaAdSet(
                    name="Primary",
                    daily_budget_cents=1650,
                    targeting_description="Adults",
                    creatives=[
                        MetaCreative(headline="A", body="One", call_to_action="Learn More"),
                        MetaCreative(headline="B", body="Two", call_to_action="Learn More"),
                    ],
                )
            ]
        ),
        access_token="tok",
        ad_account_id="act_1",
    )

    creative_calls = [params for name, params in recorder.calls if name == "create_ad_creative"]
    ad_calls = [params for name, params in recorder.calls if name == "create_ad"]
    assert len(creative_calls) == 2
    assert len(ad_calls) == 2
    assert creative_calls[0]["name"] == "Primary Creative 1"
    assert creative_calls[1]["name"] == "Primary Creative 2"
    assert ad_calls[0]["name"] == "Primary Ad 1"
    assert ad_calls[1]["name"] == "Primary Ad 2"


def test_push_supports_awareness_objective(monkeypatch, meta_configured):
    recorder = _Recorder()
    _patch_sdk(monkeypatch, recorder)
    _patch_interest_http(monkeypatch)
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


def _multi_ad_set_plan() -> MetaCampaignPlan:
    creative = MetaCreative(headline="Fresh", body="Visit.", call_to_action="Learn More")
    return _plan(
        ad_sets=[
            MetaAdSet(
                name="Segment A",
                daily_budget_cents=800,
                targeting_description="Home bakers",
                creatives=[creative],
            ),
            MetaAdSet(
                name="Segment B",
                daily_budget_cents=800,
                targeting_description="Office workers",
                creatives=[creative],
            ),
        ]
    )


def test_push_registers_split_test_for_multi_ad_set_with_business_id(monkeypatch, meta_configured):
    recorder = _Recorder()
    _patch_sdk(monkeypatch, recorder)
    _patch_interest_http(monkeypatch)
    from facebook_business.adobjects.business import Business

    captured = {}

    def fake_create_ad_study(self, fields=None, params=None, **kwargs):
        captured["params"] = params
        return {"id": "study-1"}

    monkeypatch.setattr(Business, "create_ad_study", fake_create_ad_study)

    client = RealMetaAdsPushClient()
    result = client.push(_multi_ad_set_plan(), access_token="tok", ad_account_id="act_1", business_id="biz-1")

    assert result == "camp-1"
    assert client.last_ad_study_id == "study-1"
    assert captured["params"]["type"] == "SPLIT_TEST"
    assert len(captured["params"]["cells"]) == 2
    assert captured["params"]["cells"][0]["adsets"] == ["adset-1"]
    assert captured["params"]["cells"][1]["adsets"] == ["adset-2"]
    assert captured["params"]["cells"][0]["treatment_percentage"] == 50


def test_push_skips_split_test_without_business_id(monkeypatch, meta_configured):
    recorder = _Recorder()
    _patch_sdk(monkeypatch, recorder)
    _patch_interest_http(monkeypatch)
    from facebook_business.adobjects.business import Business

    called = {"n": 0}
    monkeypatch.setattr(Business, "create_ad_study", lambda *a, **k: called.__setitem__("n", called["n"] + 1) or {"id": "x"})

    client = RealMetaAdsPushClient()
    client.push(_multi_ad_set_plan(), access_token="tok", ad_account_id="act_1", business_id=None)

    assert client.last_ad_study_id is None
    assert called["n"] == 0


def test_push_skips_split_test_with_single_ad_set(monkeypatch, meta_configured):
    recorder = _Recorder()
    _patch_sdk(monkeypatch, recorder)
    _patch_interest_http(monkeypatch)
    from facebook_business.adobjects.business import Business

    called = {"n": 0}
    monkeypatch.setattr(Business, "create_ad_study", lambda *a, **k: called.__setitem__("n", called["n"] + 1) or {"id": "x"})

    client = RealMetaAdsPushClient()
    client.push(_plan(), access_token="tok", ad_account_id="act_1", business_id="biz-1")

    assert client.last_ad_study_id is None
    assert called["n"] == 0


def test_push_survives_split_test_registration_failure(monkeypatch, meta_configured):
    recorder = _Recorder()
    _patch_sdk(monkeypatch, recorder)
    _patch_interest_http(monkeypatch)
    from facebook_business.adobjects.business import Business

    def boom(self, fields=None, params=None, **kwargs):
        raise RuntimeError("Meta split test rejected")

    monkeypatch.setattr(Business, "create_ad_study", boom)

    client = RealMetaAdsPushClient()
    result = client.push(_multi_ad_set_plan(), access_token="tok", ad_account_id="act_1", business_id="biz-1")

    assert result == "camp-1"
    assert client.last_ad_study_id is None
    assert any(name == "create_campaign" for name, _ in recorder.calls)