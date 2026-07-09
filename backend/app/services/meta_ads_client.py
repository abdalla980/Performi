from typing import Protocol

from app.config import get_settings
from app.schemas.meta_plan import MetaCampaignPlan


class MetaAdsPushPort(Protocol):
    def push(self, plan: MetaCampaignPlan, access_token: str, ad_account_id: str) -> str: ...


class FakeMetaAdsPushClient:
    def __init__(self, external_id: str = "fake-meta-campaign", raise_error: Exception | None = None):
        self._external_id = external_id
        self._raise_error = raise_error

    def push(self, plan: MetaCampaignPlan, access_token: str, ad_account_id: str) -> str:
        if self._raise_error is not None:
            raise self._raise_error
        return self._external_id


class RealMetaAdsPushClient:
    """Thin wrapper around the official facebook-business SDK. Only exercised against a
    real Meta sandbox ad account, never by the fast unit test suite."""

    def push(self, plan: MetaCampaignPlan, access_token: str, ad_account_id: str) -> str:
        from facebook_business.adobjects.adaccount import AdAccount
        from facebook_business.adobjects.campaign import Campaign
        from facebook_business.api import FacebookAdsApi

        settings = get_settings()
        FacebookAdsApi.init(settings.meta_app_id, settings.meta_app_secret, access_token)
        account = AdAccount(ad_account_id)
        campaign = account.create_campaign(
            params={
                Campaign.Field.name: plan.campaign_name,
                Campaign.Field.objective: plan.objective.upper(),
                Campaign.Field.status: Campaign.Status.paused,
            }
        )
        return campaign[Campaign.Field.id]
