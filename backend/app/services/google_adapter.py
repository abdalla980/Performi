from app.schemas.campaign_ir import CampaignIR
from app.schemas.google_plan import GoogleAdGroup, GoogleCampaignPlan


def adapt_to_google(ir: CampaignIR) -> GoogleCampaignPlan:
    ad_group = GoogleAdGroup(
        name=f"{ir.campaign_name} - Primary",
        keywords=list(ir.keywords),
        headlines=[variant.headline for variant in ir.ad_copy],
        descriptions=[variant.description for variant in ir.ad_copy],
    )
    return GoogleCampaignPlan(
        campaign_name=ir.campaign_name,
        daily_budget_micros=round(ir.daily_budget_usd * 1_000_000),
        end_date=ir.end_date,
        ad_groups=[ad_group],
    )
