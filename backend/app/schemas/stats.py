from pydantic import BaseModel


class ImpactStatsResponse(BaseModel):
    campaigns_launched: int
    estimated_hours_saved: float
    guardrail_issues_caught: int
