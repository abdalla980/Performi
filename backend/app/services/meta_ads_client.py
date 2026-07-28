from typing import Protocol

import httpx

from app.config import get_settings
from app.schemas.meta_plan import MetaCampaignPlan
from app.services.meta_interest_resolver import resolve_interests


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


def _build_targeting(ad_set, access_token: str, http_client: httpx.Client | None = None) -> dict:
    age_min = ad_set.age_min if ad_set.age_min is not None else 18
    age_max = ad_set.age_max if ad_set.age_max is not None else 65
    targeting: dict = {
        "geo_locations": {"countries": ["US"]},
        "age_min": age_min,
        "age_max": age_max,
    }
    if ad_set.interests:
        resolved, _skipped = resolve_interests(ad_set.interests, access_token, http_client=http_client)
        if resolved:
            targeting["flexible_spec"] = [
                {"interests": [{"id": r["id"], "name": r["name"]} for r in resolved]}
            ]
    return targeting


class RealMetaAdsPushClient:
    """Thin wrapper around the official facebook-business SDK. Only exercised against a
    real Meta sandbox ad account, never by the fast unit test suite.

    Only the `traffic` and `awareness` objectives are supported end-to-end: `leads` and
    `sales` need a Meta Pixel or Lead Form ID to pick a valid ad set optimization goal,
    and neither is configured anywhere in this app yet.
    """

    def push(self, plan: MetaCampaignPlan, access_token: str, ad_account_id: str) -> str:
        from facebook_business.adobjects.adaccount import AdAccount
        from facebook_business.adobjects.adcreative import AdCreative
        from facebook_business.adobjects.adset import AdSet
        from facebook_business.adobjects.ad import Ad
        from facebook_business.adobjects.campaign import Campaign
        from facebook_business.api import FacebookAdsApi

        objective_map = {
            "traffic": Campaign.Objective.outcome_traffic,
            "awareness": Campaign.Objective.outcome_awareness,
            "leads": Campaign.Objective.outcome_leads,
            "sales": Campaign.Objective.outcome_sales,
        }
        optimization_goal_map = {
            "traffic": AdSet.OptimizationGoal.link_clicks,
            "awareness": AdSet.OptimizationGoal.reach,
        }
        if plan.objective not in optimization_goal_map:
            raise ValueError(
                f"Meta objective '{plan.objective}' needs a Pixel or Lead Form ID to pick a valid "
                f"ad set optimization goal, which isn't configured in this app yet. Supported for "
                f"now: {sorted(optimization_goal_map)}."
            )

        settings = get_settings()
        if not settings.meta_page_id:
            raise ValueError("META_PAGE_ID must be configured to create Meta ad creative")

        FacebookAdsApi.init(settings.meta_app_id, settings.meta_app_secret, access_token)
        account = AdAccount(ad_account_id)
        campaign = account.create_campaign(
            params={
                Campaign.Field.name: plan.campaign_name,
                Campaign.Field.objective: objective_map[plan.objective],
                Campaign.Field.status: Campaign.Status.paused,
                # Required on every campaign create, even when nothing special
                # applies — Meta rejects the call outright without it.
                Campaign.Field.special_ad_categories: [],
            }
        )
        campaign_id = campaign[Campaign.Field.id]

        with httpx.Client(timeout=15.0) as http_client:
            for ad_set in plan.ad_sets:
                targeting = _build_targeting(ad_set, access_token, http_client=http_client)
                adset = account.create_ad_set(
                    params={
                        AdSet.Field.name: ad_set.name,
                        AdSet.Field.campaign_id: campaign_id,
                        AdSet.Field.daily_budget: ad_set.daily_budget_cents,
                        AdSet.Field.billing_event: AdSet.BillingEvent.impressions,
                        AdSet.Field.optimization_goal: optimization_goal_map[plan.objective],
                        AdSet.Field.destination_type: AdSet.DestinationType.website,
                        AdSet.Field.targeting: targeting,
                        AdSet.Field.status: AdSet.Status.paused,
                    }
                )
                adset_id = adset[AdSet.Field.id]

                for index, creative_spec in enumerate(ad_set.creatives):
                    creative = account.create_ad_creative(
                        params={
                            AdCreative.Field.name: f"{ad_set.name} Creative {index + 1}",
                            AdCreative.Field.object_story_spec: {
                                "page_id": settings.meta_page_id,
                                "link_data": {
                                    "message": creative_spec.body,
                                    "link": plan.website_url,
                                    "name": creative_spec.headline,
                                    # call_to_action is free-text ad copy, not one of
                                    # Meta's fixed CTA button values — use a safe universal
                                    # default for the button itself.
                                    "call_to_action": {"type": "LEARN_MORE"},
                                },
                            },
                        }
                    )
                    creative_id = creative[AdCreative.Field.id]

                    account.create_ad(
                        params={
                            Ad.Field.name: f"{ad_set.name} Ad {index + 1}",
                            Ad.Field.adset_id: adset_id,
                            Ad.Field.creative: {"creative_id": creative_id},
                            Ad.Field.status: Ad.Status.paused,
                        }
                    )

        return campaign_id


class DemoAwareMetaAdsPushClient:
    """Routes to the real Graph API unless `ad_account_id` is a demo-connect
    placeholder (see clients.py's meta_demo_connect, which stamps ad_account_id as
    f"demo-{client_id[:8]}"). META_APP_ID/SECRET being real and configured does not
    mean a given client's token is — this check catches that case."""

    def push(self, plan: MetaCampaignPlan, access_token: str, ad_account_id: str) -> str:
        if ad_account_id.startswith("demo-"):
            return FakeMetaAdsPushClient(external_id=f"demo-meta-{ad_account_id}").push(
                plan, access_token, ad_account_id
            )
        return RealMetaAdsPushClient().push(plan, access_token, ad_account_id)
