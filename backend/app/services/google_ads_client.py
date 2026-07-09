from typing import Protocol

from app.config import get_settings
from app.schemas.google_plan import GoogleCampaignPlan


class GoogleAdsPushPort(Protocol):
    def push(self, plan: GoogleCampaignPlan, refresh_token: str, customer_id: str) -> str: ...


class FakeGoogleAdsPushClient:
    def __init__(self, external_id: str = "fake-google-campaign", raise_error: Exception | None = None):
        self._external_id = external_id
        self._raise_error = raise_error

    def push(self, plan: GoogleCampaignPlan, refresh_token: str, customer_id: str) -> str:
        if self._raise_error is not None:
            raise self._raise_error
        return self._external_id


class RealGoogleAdsPushClient:
    """Thin wrapper around the official google-ads SDK. Only exercised against a real
    Google Ads sandbox account, never by the fast unit test suite."""

    def push(self, plan: GoogleCampaignPlan, refresh_token: str, customer_id: str) -> str:
        from google.ads.googleads.client import GoogleAdsClient

        settings = get_settings()
        gclient = GoogleAdsClient.load_from_dict(
            {
                "developer_token": settings.google_ads_developer_token,
                "client_id": settings.google_ads_client_id,
                "client_secret": settings.google_ads_client_secret,
                "refresh_token": refresh_token,
                "use_proto_plus": True,
            }
        )
        campaign_budget_service = gclient.get_service("CampaignBudgetService")
        campaign_service = gclient.get_service("CampaignService")
        ad_group_service = gclient.get_service("AdGroupService")

        budget_op = gclient.get_type("CampaignBudgetOperation")
        budget_op.create.name = f"{plan.campaign_name} Budget"
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
        campaign_result = campaign_service.mutate_campaigns(
            customer_id=customer_id, operations=[campaign_op]
        ).results[0]

        for group in plan.ad_groups:
            group_op = gclient.get_type("AdGroupOperation")
            group_op.create.name = group.name
            group_op.create.campaign = campaign_result.resource_name
            ad_group_service.mutate_ad_groups(customer_id=customer_id, operations=[group_op])

        return campaign_result.resource_name
