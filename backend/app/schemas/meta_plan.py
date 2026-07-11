from pydantic import BaseModel


class MetaAdSet(BaseModel):
    name: str
    daily_budget_cents: int
    targeting_description: str
    creative_headline: str
    creative_body: str
    call_to_action: str


class MetaCampaignPlan(BaseModel):
    campaign_name: str
    objective: str
    website_url: str | None = None
    ad_sets: list[MetaAdSet]
