from datetime import date

import pytest

from app.schemas.google_plan import GoogleAdGroup, GoogleCampaignPlan, GoogleKeyword, Sitelink
from app.services.google_ads_client import RealGoogleAdsPushClient


class _MutateResult:
    def __init__(self, resource_names):
        if isinstance(resource_names, str):
            resource_names = [resource_names]
        self.results = [type("Result", (), {"resource_name": name})() for name in resource_names]


class _FakeService:
    """Records every mutate_* call made against it instead of hitting the network."""

    def __init__(self):
        self.calls = []
        self._asset_counter = 0

    def _record(self, name, customer_id, operations):
        self.calls.append((name, customer_id, list(operations)))

    def mutate_campaign_budgets(self, customer_id, operations):
        self._record("mutate_campaign_budgets", customer_id, operations)
        return _MutateResult("customers/123/campaignBudgets/1")

    def mutate_campaigns(self, customer_id, operations):
        self._record("mutate_campaigns", customer_id, operations)
        return _MutateResult("customers/123/campaigns/1")

    def mutate_campaign_criteria(self, customer_id, operations):
        self._record("mutate_campaign_criteria", customer_id, operations)
        return _MutateResult("customers/123/campaignCriteria/1")

    def mutate_ad_groups(self, customer_id, operations):
        self._record("mutate_ad_groups", customer_id, operations)
        return _MutateResult(f"customers/123/adGroups/{len(self.calls)}")

    def mutate_ad_group_criteria(self, customer_id, operations):
        self._record("mutate_ad_group_criteria", customer_id, operations)
        return _MutateResult("customers/123/adGroupCriteria/1")

    def mutate_ad_group_ads(self, customer_id, operations):
        self._record("mutate_ad_group_ads", customer_id, operations)
        return _MutateResult("customers/123/adGroupAds/1")

    def mutate_assets(self, customer_id, operations):
        self._record("mutate_assets", customer_id, operations)
        names = []
        for _ in operations:
            self._asset_counter += 1
            names.append(f"customers/123/assets/{self._asset_counter}")
        return _MutateResult(names)

    def mutate_campaign_assets(self, customer_id, operations):
        self._record("mutate_campaign_assets", customer_id, operations)
        return _MutateResult("customers/123/campaignAssets/1")


class _FakeGoogleAdsClient:
    """Builds real proto-plus message types (so field-name typos still fail) while
    routing all service calls through one recorder instead of the real API."""

    def __init__(self):
        self.service = _FakeService()

        from google.ads.googleads.v24.common.types.ad_asset import AdTextAsset
        from google.ads.googleads.v24.enums.types.advertising_channel_type import (
            AdvertisingChannelTypeEnum,
        )
        from google.ads.googleads.v24.enums.types.asset_field_type import AssetFieldTypeEnum
        from google.ads.googleads.v24.enums.types.campaign_status import CampaignStatusEnum
        from google.ads.googleads.v24.enums.types.eu_political_advertising_status import (
            EuPoliticalAdvertisingStatusEnum,
        )
        from google.ads.googleads.v24.enums.types.keyword_match_type import KeywordMatchTypeEnum
        from google.ads.googleads.v24.services.types.ad_group_ad_service import AdGroupAdOperation
        from google.ads.googleads.v24.services.types.ad_group_criterion_service import (
            AdGroupCriterionOperation,
        )
        from google.ads.googleads.v24.services.types.ad_group_service import AdGroupOperation
        from google.ads.googleads.v24.services.types.asset_service import AssetOperation
        from google.ads.googleads.v24.services.types.campaign_asset_service import (
            CampaignAssetOperation,
        )
        from google.ads.googleads.v24.services.types.campaign_budget_service import (
            CampaignBudgetOperation,
        )
        from google.ads.googleads.v24.services.types.campaign_criterion_service import (
            CampaignCriterionOperation,
        )
        from google.ads.googleads.v24.services.types.campaign_service import CampaignOperation

        self._type_map = {
            "CampaignBudgetOperation": CampaignBudgetOperation,
            "CampaignOperation": CampaignOperation,
            "CampaignCriterionOperation": CampaignCriterionOperation,
            "AdGroupOperation": AdGroupOperation,
            "AdGroupCriterionOperation": AdGroupCriterionOperation,
            "AdGroupAdOperation": AdGroupAdOperation,
            "AdTextAsset": AdTextAsset,
            "AssetOperation": AssetOperation,
            "CampaignAssetOperation": CampaignAssetOperation,
        }
        self.enums = type(
            "Enums",
            (),
            {
                "AdvertisingChannelTypeEnum": AdvertisingChannelTypeEnum.AdvertisingChannelType,
                "CampaignStatusEnum": CampaignStatusEnum.CampaignStatus,
                "KeywordMatchTypeEnum": KeywordMatchTypeEnum.KeywordMatchType,
                "AssetFieldTypeEnum": AssetFieldTypeEnum.AssetFieldType,
                "EuPoliticalAdvertisingStatusEnum": EuPoliticalAdvertisingStatusEnum.EuPoliticalAdvertisingStatus,
            },
        )()

    def get_service(self, name):
        return self.service

    def get_type(self, name):
        return self._type_map[name]()


def _plan(**overrides) -> GoogleCampaignPlan:
    defaults = dict(
        campaign_name="Austin Bakery",
        daily_budget_micros=16_500_000,
        final_url="https://example.com/bakery",
        negative_keywords=["free"],
        ad_groups=[
            GoogleAdGroup(
                name="Primary",
                keywords=[GoogleKeyword(text="bakery near me"), GoogleKeyword(text="fresh pastries")],
                headlines=["Fresh Pastries Daily", "Austin's Best Bakery", "Order Online Now"],
                descriptions=["Visit today.", "Baked fresh every morning."],
            )
        ],
    )
    defaults.update(overrides)
    return GoogleCampaignPlan(**defaults)


def test_each_push_uses_a_unique_budget_name(monkeypatch):
    # Budget names must be unique per Google Ads account, so a retry or relaunch
    # after a partial failure must not reuse the previous attempt's name.
    fake_client = _FakeGoogleAdsClient()
    monkeypatch.setattr("google.ads.googleads.client.GoogleAdsClient.load_from_dict", lambda config: fake_client)

    for _ in range(2):
        RealGoogleAdsPushClient().push(_plan(), refresh_token="rt", login_customer_id="1", customer_id="123")

    names = [ops[0].create.name for name, _, ops in fake_client.service.calls if name == "mutate_campaign_budgets"]
    assert len(set(names)) == 2


def test_push_creates_budget_campaign_ad_group_keywords_and_rsa(monkeypatch):
    fake_client = _FakeGoogleAdsClient()
    captured = {}

    def load_from_dict(config):
        captured.update(config)
        return fake_client

    monkeypatch.setattr("google.ads.googleads.client.GoogleAdsClient.load_from_dict", load_from_dict)

    result = RealGoogleAdsPushClient().push(
        _plan(), refresh_token="rt", login_customer_id="4574433227", customer_id="123"
    )

    assert captured["login_customer_id"] == "4574433227"
    assert result == "customers/123/campaigns/1"
    calls_by_name = {name: (customer_id, ops) for name, customer_id, ops in fake_client.service.calls}

    budget_ops = calls_by_name["mutate_campaign_budgets"][1]
    assert budget_ops[0].create.amount_micros == 16_500_000
    assert budget_ops[0].create.name.startswith("Austin Bakery Budget ")

    campaign_ops = calls_by_name["mutate_campaigns"][1]
    assert campaign_ops[0].create.name == "Austin Bakery"
    assert campaign_ops[0].create.status == fake_client.enums.CampaignStatusEnum.PAUSED
    # Google rejects new Search campaigns without a bidding strategy and an explicit
    # EU political advertising declaration (both confirmed via validate_only).
    assert campaign_ops[0].create.contains_eu_political_advertising == (
        fake_client.enums.EuPoliticalAdvertisingStatusEnum.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING
    )
    assert "target_spend" in campaign_ops[0].create

    ad_group_ops = calls_by_name["mutate_ad_groups"][1]
    assert ad_group_ops[0].create.name == "Primary"

    keyword_ops = calls_by_name["mutate_ad_group_criteria"][1]
    assert {op.create.keyword.text for op in keyword_ops} == {"bakery near me", "fresh pastries"}
    assert all(
        op.create.keyword.match_type == fake_client.enums.KeywordMatchTypeEnum.PHRASE for op in keyword_ops
    )

    negative_ops = calls_by_name["mutate_campaign_criteria"][1]
    assert negative_ops[0].create.negative is True
    assert negative_ops[0].create.keyword.text == "free"

    ad_ops = calls_by_name["mutate_ad_group_ads"][1]
    rsa = ad_ops[0].create.ad.responsive_search_ad
    assert [asset.text for asset in rsa.headlines] == [
        "Fresh Pastries Daily",
        "Austin's Best Bakery",
        "Order Online Now",
    ]
    assert [asset.text for asset in rsa.descriptions] == ["Visit today.", "Baked fresh every morning."]
    assert list(ad_ops[0].create.ad.final_urls) == ["https://example.com/bakery"]


def test_push_honors_per_keyword_match_types(monkeypatch):
    fake_client = _FakeGoogleAdsClient()
    monkeypatch.setattr(
        "google.ads.googleads.client.GoogleAdsClient.load_from_dict", lambda config: fake_client
    )

    RealGoogleAdsPushClient().push(
        _plan(
            ad_groups=[
                GoogleAdGroup(
                    name="Primary",
                    keywords=[
                        GoogleKeyword(text="exact bakery", match_type="exact"),
                        GoogleKeyword(text="broad bakery", match_type="broad"),
                    ],
                    headlines=["Fresh Pastries Daily", "Austin's Best Bakery", "Order Online Now"],
                    descriptions=["Visit today.", "Baked fresh every morning."],
                )
            ]
        ),
        refresh_token="rt",
        login_customer_id="4574433227",
        customer_id="123",
    )

    keyword_ops = next(ops for name, _, ops in fake_client.service.calls if name == "mutate_ad_group_criteria")
    by_text = {op.create.keyword.text: op.create.keyword.match_type for op in keyword_ops}
    assert by_text["exact bakery"] == fake_client.enums.KeywordMatchTypeEnum.EXACT
    assert by_text["broad bakery"] == fake_client.enums.KeywordMatchTypeEnum.BROAD


def test_push_creates_extension_assets_when_present(monkeypatch):
    fake_client = _FakeGoogleAdsClient()
    monkeypatch.setattr(
        "google.ads.googleads.client.GoogleAdsClient.load_from_dict", lambda config: fake_client
    )

    RealGoogleAdsPushClient().push(
        _plan(
            callouts=["Free Shipping"],
            structured_snippets={"Services": ["Repair", "Install"]},
            sitelinks=[Sitelink(text="Menu", url="https://example.com/menu", description="See our menu")],
        ),
        refresh_token="rt",
        login_customer_id="4574433227",
        customer_id="123",
    )

    calls_by_name = {name: ops for name, _, ops in fake_client.service.calls}
    assert "mutate_assets" in calls_by_name
    assert "mutate_campaign_assets" in calls_by_name
    asset_ops = calls_by_name["mutate_assets"]
    assert asset_ops[0].create.callout_asset.callout_text == "Free Shipping"
    assert asset_ops[1].create.structured_snippet_asset.header == "Services"
    assert list(asset_ops[1].create.structured_snippet_asset.values) == ["Repair", "Install"]
    assert asset_ops[2].create.sitelink_asset.link_text == "Menu"
    assert list(asset_ops[2].create.final_urls) == ["https://example.com/menu"]

    campaign_asset_ops = calls_by_name["mutate_campaign_assets"]
    assert campaign_asset_ops[0].create.field_type == fake_client.enums.AssetFieldTypeEnum.CALLOUT
    assert campaign_asset_ops[1].create.field_type == fake_client.enums.AssetFieldTypeEnum.STRUCTURED_SNIPPET
    assert campaign_asset_ops[2].create.field_type == fake_client.enums.AssetFieldTypeEnum.SITELINK


def test_push_sets_campaign_end_date_when_present(monkeypatch):
    fake_client = _FakeGoogleAdsClient()
    monkeypatch.setattr(
        "google.ads.googleads.client.GoogleAdsClient.load_from_dict", lambda config: fake_client
    )

    RealGoogleAdsPushClient().push(_plan(end_date=date(2026, 12, 31)), refresh_token="rt", login_customer_id="4574433227", customer_id="123")

    campaign_ops = fake_client.service.calls[1][2]
    assert campaign_ops[0].create.end_date_time == "2026-12-31"


def test_push_raises_when_final_url_missing(monkeypatch):
    fake_client = _FakeGoogleAdsClient()
    monkeypatch.setattr(
        "google.ads.googleads.client.GoogleAdsClient.load_from_dict", lambda config: fake_client
    )

    with pytest.raises(ValueError, match="final_url"):
        RealGoogleAdsPushClient().push(_plan(final_url=None), refresh_token="rt", login_customer_id="4574433227", customer_id="123")

    assert fake_client.service.calls == []
