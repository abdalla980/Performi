from app.schemas.campaign_ir import CampaignIR
from app.schemas.meta_plan import MetaAdSet, MetaCampaignPlan, MetaCreative


def adapt_to_meta(ir: CampaignIR) -> MetaCampaignPlan:
    per_set_budget = round(ir.daily_budget_usd * 100 / max(len(ir.audience_segments), 1))
    ad_sets = []
    for segment in ir.audience_segments:
        ad_sets.append(
            MetaAdSet(
                name=f"{ir.campaign_name} - {segment.name}",
                daily_budget_cents=per_set_budget,
                targeting_description=segment.description,
                age_min=segment.age_min,
                age_max=segment.age_max,
                interests=list(segment.interests),
                creatives=[
                    MetaCreative(headline=v.headline, body=v.description, call_to_action=ir.call_to_action)
                    for v in segment.ad_copy
                ],
            )
        )
    return MetaCampaignPlan(
        campaign_name=ir.campaign_name,
        objective=ir.objective,
        website_url=ir.website_url,
        ad_sets=ad_sets,
    )
