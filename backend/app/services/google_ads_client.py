from typing import Protocol

from app.config import get_settings
from app.schemas.google_plan import GoogleCampaignPlan


class GoogleAdsPushPort(Protocol):
    def push(
        self, plan: GoogleCampaignPlan, refresh_token: str, login_customer_id: str, customer_id: str
    ) -> str: ...


class FakeGoogleAdsPushClient:
    def __init__(self, external_id: str = "fake-google-campaign", raise_error: Exception | None = None):
        self._external_id = external_id
        self._raise_error = raise_error

    def push(
        self, plan: GoogleCampaignPlan, refresh_token: str, login_customer_id: str, customer_id: str
    ) -> str:
        if self._raise_error is not None:
            raise self._raise_error
        return self._external_id


def _attach_extension_assets(gclient, customer_id: str, campaign_resource: str, plan: GoogleCampaignPlan) -> None:
    """Create callout / structured snippet / sitelink assets and link them to the campaign."""
    asset_service = gclient.get_service("AssetService")
    campaign_asset_service = gclient.get_service("CampaignAssetService")
    asset_ops = []

    for callout in plan.callouts:
        op = gclient.get_type("AssetOperation")
        op.create.callout_asset.callout_text = callout
        asset_ops.append(("CALLOUT", op))

    for header, values in plan.structured_snippets.items():
        if not values:
            continue
        op = gclient.get_type("AssetOperation")
        op.create.structured_snippet_asset.header = header
        op.create.structured_snippet_asset.values.extend(values)
        asset_ops.append(("STRUCTURED_SNIPPET", op))

    for sitelink in plan.sitelinks:
        op = gclient.get_type("AssetOperation")
        op.create.sitelink_asset.link_text = sitelink.text
        if sitelink.description:
            # Split optional description across description1/description2 when long.
            op.create.sitelink_asset.description1 = sitelink.description[:35]
            if len(sitelink.description) > 35:
                op.create.sitelink_asset.description2 = sitelink.description[35:70]
        op.create.final_urls.append(sitelink.url)
        asset_ops.append(("SITELINK", op))

    if not asset_ops:
        return

    field_type_enum = gclient.enums.AssetFieldTypeEnum
    field_type_map = {
        "CALLOUT": field_type_enum.CALLOUT,
        "STRUCTURED_SNIPPET": field_type_enum.STRUCTURED_SNIPPET,
        "SITELINK": field_type_enum.SITELINK,
    }

    created = asset_service.mutate_assets(
        customer_id=customer_id, operations=[op for _, op in asset_ops]
    ).results

    campaign_asset_ops = []
    for (field_type_name, _), result in zip(asset_ops, created):
        ca_op = gclient.get_type("CampaignAssetOperation")
        ca_op.create.campaign = campaign_resource
        ca_op.create.asset = result.resource_name
        ca_op.create.field_type = field_type_map[field_type_name]
        campaign_asset_ops.append(ca_op)

    campaign_asset_service.mutate_campaign_assets(customer_id=customer_id, operations=campaign_asset_ops)


class RealGoogleAdsPushClient:
    """Thin wrapper around the official google-ads SDK. Only exercised against a real
    Google Ads sandbox account, never by the fast unit test suite."""

    def push(
        self, plan: GoogleCampaignPlan, refresh_token: str, login_customer_id: str, customer_id: str
    ) -> str:
        from uuid import uuid4

        from google.ads.googleads.client import GoogleAdsClient

        if not plan.final_url:
            raise ValueError("GoogleCampaignPlan.final_url is required to create a responsive search ad")

        settings = get_settings()
        gclient = GoogleAdsClient.load_from_dict(
            {
                "developer_token": settings.google_ads_developer_token,
                "client_id": settings.google_ads_client_id,
                "client_secret": settings.google_ads_client_secret,
                "refresh_token": refresh_token,
                "login_customer_id": login_customer_id,
                "use_proto_plus": True,
            }
        )
        campaign_budget_service = gclient.get_service("CampaignBudgetService")
        campaign_service = gclient.get_service("CampaignService")
        campaign_criterion_service = gclient.get_service("CampaignCriterionService")
        ad_group_service = gclient.get_service("AdGroupService")
        ad_group_criterion_service = gclient.get_service("AdGroupCriterionService")
        ad_group_ad_service = gclient.get_service("AdGroupAdService")

        match_type_map = {
            "exact": gclient.enums.KeywordMatchTypeEnum.EXACT,
            "phrase": gclient.enums.KeywordMatchTypeEnum.PHRASE,
            "broad": gclient.enums.KeywordMatchTypeEnum.BROAD,
        }

        budget_op = gclient.get_type("CampaignBudgetOperation")
        # Budget names must be unique per account; a suffix keeps a retry or relaunch
        # from colliding with a budget an earlier, partially failed attempt left behind.
        budget_op.create.name = f"{plan.campaign_name} Budget {uuid4().hex[:8]}"
        budget_op.create.amount_micros = plan.daily_budget_micros
        budget_resource = (
            campaign_budget_service.mutate_campaign_budgets(customer_id=customer_id, operations=[budget_op])
            .results[0]
            .resource_name
        )

        campaign_op = gclient.get_type("CampaignOperation")
        campaign_op.create.name = plan.campaign_name
        campaign_op.create.campaign_budget = budget_resource
        campaign_op.create.advertising_channel_type = gclient.enums.AdvertisingChannelTypeEnum.SEARCH
        campaign_op.create.status = gclient.enums.CampaignStatusEnum.PAUSED
        # Both are required on new Search campaigns (Google returns field_error REQUIRED
        # without them): Maximize clicks with no CPC cap, and an explicit declaration
        # that the ads aren't EU political advertising.
        campaign_op.create.target_spend.target_spend_micros = 0
        campaign_op.create.contains_eu_political_advertising = (
            gclient.enums.EuPoliticalAdvertisingStatusEnum.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING
        )
        if plan.end_date is not None:
            campaign_op.create.end_date_time = plan.end_date.strftime("%Y-%m-%d")
        campaign_result = campaign_service.mutate_campaigns(
            customer_id=customer_id, operations=[campaign_op]
        ).results[0]

        if plan.negative_keywords:
            negative_ops = []
            for keyword_text in plan.negative_keywords:
                criterion_op = gclient.get_type("CampaignCriterionOperation")
                criterion_op.create.campaign = campaign_result.resource_name
                criterion_op.create.negative = True
                criterion_op.create.keyword.text = keyword_text
                criterion_op.create.keyword.match_type = gclient.enums.KeywordMatchTypeEnum.BROAD
                negative_ops.append(criterion_op)
            campaign_criterion_service.mutate_campaign_criteria(
                customer_id=customer_id, operations=negative_ops
            )

        _attach_extension_assets(gclient, customer_id, campaign_result.resource_name, plan)

        for group in plan.ad_groups:
            group_op = gclient.get_type("AdGroupOperation")
            group_op.create.name = group.name
            group_op.create.campaign = campaign_result.resource_name
            group_resource = (
                ad_group_service.mutate_ad_groups(customer_id=customer_id, operations=[group_op])
                .results[0]
                .resource_name
            )

            if group.keywords:
                keyword_ops = []
                for keyword in group.keywords:
                    criterion_op = gclient.get_type("AdGroupCriterionOperation")
                    criterion_op.create.ad_group = group_resource
                    criterion_op.create.keyword.text = keyword.text
                    criterion_op.create.keyword.match_type = match_type_map.get(
                        keyword.match_type, gclient.enums.KeywordMatchTypeEnum.PHRASE
                    )
                    keyword_ops.append(criterion_op)
                ad_group_criterion_service.mutate_ad_group_criteria(
                    customer_id=customer_id, operations=keyword_ops
                )

            ad_op = gclient.get_type("AdGroupAdOperation")
            ad_op.create.ad_group = group_resource
            ad_op.create.ad.final_urls.append(plan.final_url)
            for headline in group.headlines:
                asset = gclient.get_type("AdTextAsset")
                asset.text = headline
                ad_op.create.ad.responsive_search_ad.headlines.append(asset)
            for description in group.descriptions:
                asset = gclient.get_type("AdTextAsset")
                asset.text = description
                ad_op.create.ad.responsive_search_ad.descriptions.append(asset)
            ad_group_ad_service.mutate_ad_group_ads(customer_id=customer_id, operations=[ad_op])

        return campaign_result.resource_name


class DemoAwareGoogleAdsPushClient:
    """Routes to the real Google Ads API unless `customer_id` is a demo-connect
    placeholder (see clients.py's google_demo_connect, which stamps customer_id as
    f"demo-{client_id[:8]}"). Without this check, a demo-connected client's fabricated
    refresh token would reach RealGoogleAdsPushClient and always fail."""

    def push(
        self, plan: GoogleCampaignPlan, refresh_token: str, login_customer_id: str, customer_id: str
    ) -> str:
        if customer_id.startswith("demo-"):
            return FakeGoogleAdsPushClient(external_id=f"demo-google-{customer_id}").push(
                plan, refresh_token, login_customer_id, customer_id
            )
        return RealGoogleAdsPushClient().push(plan, refresh_token, login_customer_id, customer_id)
