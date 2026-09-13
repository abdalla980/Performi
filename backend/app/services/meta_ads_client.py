from typing import Protocol

import httpx

from app.config import get_settings
from app.schemas.meta_plan import MetaCampaignPlan
from app.services.meta_interest_resolver import resolve_interests


class MetaAdsPushPort(Protocol):
    def push(
        self,
        plan: MetaCampaignPlan,
        access_token: str,
        ad_account_id: str,
        business_id: str | None = None,
    ) -> str: ...


class FakeMetaAdsPushClient:
    def __init__(self, external_id: str = "fake-meta-campaign", raise_error: Exception | None = None):
        self._external_id = external_id
        self._raise_error = raise_error
        self.last_ad_study_id: str | None = None

    def push(
        self,
        plan: MetaCampaignPlan,
        access_token: str,
        ad_account_id: str,
        business_id: str | None = None,
    ) -> str:
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
        # This app already builds explicit structured targeting (age/geo/interests) —
        # disable Meta's Advantage+ audience expansion rather than let it override it.
        "targeting_automation": {"advantage_audience": 0},
    }
    if ad_set.interests:
        resolved, _skipped = resolve_interests(ad_set.interests, access_token, http_client=http_client)
        if resolved:
            targeting["flexible_spec"] = [
                {"interests": [{"id": r["id"], "name": r["name"]} for r in resolved]}
            ]
    return targeting


def _register_split_test(business_id: str, campaign_name: str, ad_set_ids: list[str]) -> str | None:
    """Best-effort: a failure here does not fail the launch — the campaign and ad
    sets are already live (paused) at this point regardless.

    OPEN QUESTION (sandbox before production): campaigns/ad sets are created PAUSED
    by design. It is not verified whether Meta's split-test scheduling (start_time)
    auto-activates the referenced ad sets when the test window opens. If it does,
    auto-registering would silently bypass the paused-by-default safety gate.
    Fallback if confirmed unsafe: stop auto-registering and surface an
    agency-triggered "Set up split test" action instead.
    """
    if len(ad_set_ids) < 2 or not business_id:
        return None
    import time

    from facebook_business.adobjects.business import Business

    share = round(100 / len(ad_set_ids))
    cells = [
        {"name": f"Group {chr(65 + i)}", "treatment_percentage": share, "adsets": [ad_set_id]}
        for i, ad_set_id in enumerate(ad_set_ids)
    ]
    now = int(time.time())
    try:
        study = Business(business_id).create_ad_study(
            params={
                "name": campaign_name,
                "description": f"Auto-generated audience split test for {campaign_name}",
                "type": "SPLIT_TEST",
                "cells": cells,
                "start_time": now,
                "end_time": now + 14 * 86400,  # 14-day default window
            }
        )
        return study.get("id")
    except Exception:
        return None


class RealMetaAdsPushClient:
    """Thin wrapper around the official facebook-business SDK. Only exercised against a
    real Meta sandbox ad account, never by the fast unit test suite.

    Only the `traffic` and `awareness` objectives are supported end-to-end: `leads` and
    `sales` need a Meta Pixel or Lead Form ID to pick a valid ad set optimization goal,
    and neither is configured anywhere in this app yet.
    """

    def __init__(self) -> None:
        self.last_ad_study_id: str | None = None

    def push(
        self,
        plan: MetaCampaignPlan,
        access_token: str,
        ad_account_id: str,
        business_id: str | None = None,
    ) -> str:
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
                # Budgets are set per ad set below, not at the campaign level —
                # Meta's v25+ API requires this explicitly rather than defaulting it.
                Campaign.Field.is_adset_budget_sharing_enabled: False,
            }
        )
        campaign_id = campaign[Campaign.Field.id]
        ad_set_ids: list[str] = []

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
                        # No manual bid cap configured anywhere in this app — let Meta
                        # auto-bid for the lowest cost per result, its uncapped default.
                        AdSet.Field.bid_strategy: AdSet.BidStrategy.lowest_cost_without_cap,
                    }
                )
                adset_id = adset[AdSet.Field.id]
                ad_set_ids.append(adset_id)

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

        self.last_ad_study_id = (
            _register_split_test(business_id, plan.campaign_name, ad_set_ids) if business_id else None
        )
        return campaign_id


class DemoAwareMetaAdsPushClient:
    """Routes to the real Graph API unless `ad_account_id` is a demo-connect
    placeholder (see clients.py's meta_demo_connect, which stamps ad_account_id as
    f"demo-{client_id[:8]}"). META_APP_ID/SECRET being real and configured does not
    mean a given client's token is — this check catches that case."""

    def __init__(self) -> None:
        self.last_ad_study_id: str | None = None

    def push(
        self,
        plan: MetaCampaignPlan,
        access_token: str,
        ad_account_id: str,
        business_id: str | None = None,
    ) -> str:
        if ad_account_id.startswith("demo-"):
            self.last_ad_study_id = None
            return FakeMetaAdsPushClient(external_id=f"demo-meta-{ad_account_id}").push(
                plan, access_token, ad_account_id, business_id=business_id
            )
        real = RealMetaAdsPushClient()
        result = real.push(plan, access_token, ad_account_id, business_id=business_id)
        self.last_ad_study_id = real.last_ad_study_id
        return result
