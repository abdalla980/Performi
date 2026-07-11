from app.schemas.campaign_ir import AdCopyVariant, CampaignIR
from app.services.projections import compute_projected_metrics


def _ir(daily_budget_usd=20.0) -> CampaignIR:
    return CampaignIR(
        campaign_name="Austin Bakery",
        objective="traffic",
        daily_budget_usd=daily_budget_usd,
        keywords=["bakery near me"],
        audience_description="Adults 25-54 near Austin",
        ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
        call_to_action="Visit Us Today",
    )


def test_splits_budget_evenly_across_selected_platforms():
    metrics = compute_projected_metrics(
        _ir(daily_budget_usd=20.0), platforms=["google", "meta"], has_target_location=False
    )

    assert len(metrics.platforms) == 2
    google = next(p for p in metrics.platforms if p.platform == "google")
    meta = next(p for p in metrics.platforms if p.platform == "meta")
    assert google.daily_budget_usd == 10.0
    assert meta.daily_budget_usd == 10.0
    assert google.estimated_daily_clicks > 0
    assert google.estimated_daily_impressions > 0


def test_single_platform_gets_full_budget():
    metrics = compute_projected_metrics(_ir(daily_budget_usd=20.0), platforms=["google"], has_target_location=False)

    assert len(metrics.platforms) == 1
    assert metrics.platforms[0].daily_budget_usd == 20.0


def test_no_location_reach_without_target_location():
    metrics = compute_projected_metrics(_ir(), platforms=["google"], has_target_location=False)
    assert metrics.estimated_location_reach is None


def test_location_reach_present_when_target_location_given():
    metrics = compute_projected_metrics(_ir(), platforms=["google"], has_target_location=True)
    assert metrics.estimated_location_reach is not None
    assert metrics.estimated_location_reach > 0


def test_empty_platforms_yields_no_projections():
    metrics = compute_projected_metrics(_ir(), platforms=[], has_target_location=True)
    assert metrics.platforms == []
    assert metrics.estimated_location_reach is None
