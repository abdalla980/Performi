import { describe, expect, it, vi } from 'vitest'
import { createHttpClientPortalApiClient } from './clientPortalApiClient.http'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function makeClient(fetchFn: ReturnType<typeof vi.fn>) {
  return createHttpClientPortalApiClient({
    baseUrl: 'http://localhost:8000',
    getAuthToken: async () => 'token-123',
    fetchFn: fetchFn as unknown as typeof fetch,
  })
}

describe('createHttpClientPortalApiClient', () => {
  it('listCampaigns maps summaries', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: 'draft-1',
          brief_id: 'brief-1',
          status: 'approved',
          business_description: 'Bakery',
          budget_usd: 500,
          goals: 'Traffic',
          created_at: '2026-07-09T00:00:00Z',
        },
      ]),
    )
    const apiClient = makeClient(fetchFn)

    const campaigns = await apiClient.listCampaigns()

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/portal/campaigns',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer token-123' }) }),
    )
    expect(campaigns).toEqual([
      {
        id: 'draft-1',
        briefId: 'brief-1',
        status: 'approved',
        businessDescription: 'Bakery',
        budgetUsd: 500,
        goals: 'Traffic',
        createdAt: '2026-07-09T00:00:00Z',
      },
    ])
  })

  it('getCampaign maps the full detail including plans and projected metrics', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'draft-1',
        brief_id: 'brief-1',
        status: 'approved',
        business_description: 'Bakery',
        budget_usd: 500,
        goals: 'Traffic',
        created_at: '2026-07-09T00:00:00Z',
        website_url: 'https://acmebakery.test',
        target_location: 'Austin, TX',
        target_audience: 'Families',
        end_date: null,
        platforms: ['google'],
        google_plan: {
          campaign_name: 'Austin Bakery',
          daily_budget_micros: 16_500_000,
          end_date: null,
          final_url: 'https://acmebakery.test',
          negative_keywords: [],
          ad_groups: [],
        },
        meta_plan: null,
        projected_metrics: {
          platforms: [
            { platform: 'google', daily_budget_usd: 16.5, estimated_daily_clicks: 8, estimated_daily_impressions: 400 },
          ],
          estimated_location_reach: 12000,
        },
        launches: [],
      }),
    )
    const apiClient = makeClient(fetchFn)

    const campaign = await apiClient.getCampaign('draft-1')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/portal/campaigns/draft-1',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(campaign.googlePlan?.campaignName).toBe('Austin Bakery')
    expect(campaign.metaPlan).toBeNull()
    expect(campaign.projectedMetrics?.estimatedLocationReach).toBe(12000)
    expect(campaign.websiteUrl).toBe('https://acmebakery.test')
    expect(campaign.targetLocation).toBe('Austin, TX')
  })

  it('decideCampaign posts the decision', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ status: 'client_approved' }))
    const apiClient = makeClient(fetchFn)

    const result = await apiClient.decideCampaign('draft-1', 'approved')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/portal/campaigns/draft-1/decision',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'approved' }) }),
    )
    expect(result).toEqual({ status: 'client_approved' })
  })

  it('throws with the response body text on an error status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('Campaign not found', { status: 404 }))
    const apiClient = makeClient(fetchFn)

    await expect(apiClient.getCampaign('draft-1')).rejects.toThrow('Campaign not found')
  })
})
