from app.schemas.campaign_ir import CampaignIR
from app.schemas.projection import PlatformProjection, ProjectedMetrics

# Rough, transparent benchmark assumptions used only to produce an illustrative estimate
# before a campaign has any real spend history — not real ad performance data.
_ASSUMED_CPC_USD = {"google": 2.0, "meta": 1.0}
_ASSUMED_CTR = {"google": 0.02, "meta": 0.01}
_REACH_WINDOW_DAYS = 30


def compute_projected_metrics(ir: CampaignIR, platforms: list[str], has_target_location: bool) -> ProjectedMetrics:
    active_platforms = [platform for platform in platforms if platform in _ASSUMED_CPC_USD]
    per_platform_budget = ir.daily_budget_usd / len(active_platforms) if active_platforms else 0.0

    projections = []
    for platform in active_platforms:
        clicks = per_platform_budget / _ASSUMED_CPC_USD[platform]
        impressions = clicks / _ASSUMED_CTR[platform]
        projections.append(
            PlatformProjection(
                platform=platform,
                daily_budget_usd=round(per_platform_budget, 2),
                estimated_daily_clicks=round(clicks, 1),
                estimated_daily_impressions=round(impressions),
            )
        )

    estimated_location_reach = None
    if has_target_location and projections:
        total_daily_impressions = sum(p.estimated_daily_impressions for p in projections)
        estimated_location_reach = round(total_daily_impressions * _REACH_WINDOW_DAYS)

    return ProjectedMetrics(platforms=projections, estimated_location_reach=estimated_location_reach)
