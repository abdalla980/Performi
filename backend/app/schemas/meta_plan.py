from pydantic import BaseModel


class MetaCreative(BaseModel):
    headline: str
    body: str
    call_to_action: str


class MetaAdSet(BaseModel):
    name: str
    daily_budget_cents: int
    targeting_description: str
    age_min: int | None = None
    age_max: int | None = None
    interests: list[str] = []
    creatives: list[MetaCreative]


class MetaCampaignPlan(BaseModel):
    campaign_name: str
    objective: str
    website_url: str | None = None
    ad_sets: list[MetaAdSet]
