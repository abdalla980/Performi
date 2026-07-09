from app.schemas.campaign_ir import CampaignIR
from app.schemas.meta_plan import MetaAdSet, MetaCampaignPlan


def adapt_to_meta(ir: CampaignIR) -> MetaCampaignPlan:
    primary_copy = ir.ad_copy[0]
    ad_set = MetaAdSet(
        name=f"{ir.campaign_name} - Primary",
        daily_budget_cents=round(ir.daily_budget_usd * 100),
        targeting_description=ir.audience_description,
        creative_headline=primary_copy.headline,
        creative_body=primary_copy.description,
        call_to_action=ir.call_to_action,
    )
    return MetaCampaignPlan(campaign_name=ir.campaign_name, objective=ir.objective, ad_sets=[ad_set])
