from app.schemas.campaign_ir import CampaignIR
from app.schemas.google_plan import GoogleAdGroup, GoogleCampaignPlan, GoogleKeyword


def adapt_to_google(ir: CampaignIR) -> GoogleCampaignPlan:
    ad_groups = []
    for segment in ir.audience_segments:
        ad_groups.append(
            GoogleAdGroup(
                name=f"{ir.campaign_name} - {segment.name}",
                keywords=[GoogleKeyword(text=kw.text, match_type=kw.match_type) for kw in segment.keywords],
                headlines=[variant.headline for variant in segment.ad_copy],
                descriptions=[variant.description for variant in segment.ad_copy],
            )
        )
    return GoogleCampaignPlan(
        campaign_name=ir.campaign_name,
        daily_budget_micros=round(ir.daily_budget_usd * 1_000_000),
        end_date=ir.end_date,
        final_url=ir.website_url,
        negative_keywords=list(ir.negative_keywords),
        ad_groups=ad_groups,
        callouts=list(ir.callouts),
        structured_snippets=dict(ir.structured_snippets),
    )
