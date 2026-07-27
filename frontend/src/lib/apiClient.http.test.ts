import { describe, expect, it, vi } from 'vitest'
import { createHttpApiClient } from './apiClient.http'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function makeClient(fetchFn: ReturnType<typeof vi.fn>) {
  return createHttpApiClient({
    baseUrl: 'http://localhost:8000',
    getAuthToken: async () => 'token-123',
    fetchFn: fetchFn as unknown as typeof fetch,
  })
}

describe('createHttpApiClient', () => {
  it('getConfigStatus maps snake_case flags to camelCase', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ anthropic_configured: false, google_ads_configured: true, meta_configured: false }))
    const apiClient = makeClient(fetchFn)

    const status = await apiClient.getConfigStatus()

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/config/status',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(status).toEqual({ anthropicConfigured: false, googleAdsConfigured: true, metaConfigured: false })
  })

  it('listClients maps connection flags for each client', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: 'client-1',
          name: 'Acme Bakery',
          google_ads_customer_id: null,
          meta_ad_account_id: null,
          google_connected: false,
          meta_connected: false,
        },
      ]),
    )
    const apiClient = makeClient(fetchFn)

    const clients = await apiClient.listClients()

    expect(fetchFn).toHaveBeenCalledWith('http://localhost:8000/clients', expect.objectContaining({ method: 'GET' }))
    expect(clients).toEqual([
      {
        id: 'client-1',
        name: 'Acme Bakery',
        googleAdsCustomerId: null,
        metaAdAccountId: null,
        googleConnected: false,
        metaConnected: false,
      },
    ])
  })

  it('createClient posts the name and maps the response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'client-1',
        name: 'Acme Bakery',
        google_ads_customer_id: null,
        meta_ad_account_id: null,
        google_connected: false,
        meta_connected: false,
      }),
    )
    const apiClient = makeClient(fetchFn)

    const client = await apiClient.createClient('Acme Bakery')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/clients',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Acme Bakery' }) }),
    )
    expect(client.name).toBe('Acme Bakery')
  })

  it('getClient maps a null brand voice', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'client-1',
        name: 'Acme Bakery',
        google_ads_customer_id: null,
        meta_ad_account_id: null,
        google_connected: false,
        meta_connected: false,
        brand_voice: null,
        assets: [],
      }),
    )
    const apiClient = makeClient(fetchFn)

    const client = await apiClient.getClient('client-1')

    expect(client.brandVoice).toBeNull()
    expect(client.assets).toEqual([])
  })

  it('getClient maps a present brand voice', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'client-1',
        name: 'Acme Bakery',
        google_ads_customer_id: null,
        meta_ad_account_id: null,
        google_connected: false,
        meta_connected: false,
        brand_voice: {
          id: 'bv-1',
          client_id: 'client-1',
          tone: 'friendly',
          banned_terms: ['cheap'],
          required_disclaimers: [],
          approved_offers: [],
        },
        assets: [
          { id: 'asset-1', kind: 'logo', filename: 'logo.png', url: '/uploads/client-1/abc.png', created_at: '2026-07-18T00:00:00Z' },
        ],
      }),
    )
    const apiClient = makeClient(fetchFn)

    const client = await apiClient.getClient('client-1')

    expect(client.assets).toEqual([
      { id: 'asset-1', kind: 'logo', filename: 'logo.png', url: '/uploads/client-1/abc.png', createdAt: '2026-07-18T00:00:00Z' },
    ])
    expect(client.brandVoice).toEqual({
      id: 'bv-1',
      clientId: 'client-1',
      tone: 'friendly',
      bannedTerms: ['cheap'],
      requiredDisclaimers: [],
      approvedOffers: [],
    })
  })

  it('deleteClient DELETEs the client route', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ status: 'deleted' }))
    const apiClient = makeClient(fetchFn)

    await apiClient.deleteClient('client-1')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/clients/client-1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('setBrandVoice PUTs snake_case fields', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'bv-1',
        client_id: 'client-1',
        tone: 'friendly',
        banned_terms: ['cheap'],
        required_disclaimers: ['Results vary.'],
        approved_offers: [],
      }),
    )
    const apiClient = makeClient(fetchFn)

    await apiClient.setBrandVoice('client-1', {
      tone: 'friendly',
      bannedTerms: ['cheap'],
      requiredDisclaimers: ['Results vary.'],
      approvedOffers: [],
    })

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/clients/client-1/brand-voice',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          tone: 'friendly',
          banned_terms: ['cheap'],
          required_disclaimers: ['Results vary.'],
          approved_offers: [],
        }),
      }),
    )
  })

  it('connectGoogleDemo and connectMetaDemo POST to the demo-connect routes', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => jsonResponse({ status: 'connected', mode: 'demo' }))
    const apiClient = makeClient(fetchFn)

    await apiClient.connectGoogleDemo('client-1')
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/clients/client-1/google/demo-connect',
      expect.objectContaining({ method: 'POST' }),
    )

    await apiClient.connectMetaDemo('client-1')
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/clients/client-1/meta/demo-connect',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('getGoogleOAuthUrl and getMetaOAuthUrl GET the oauth/start routes and return the authorize URL', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ authorize_url: 'https://accounts.google.com/o/oauth2/v2/auth?...' }))
      .mockResolvedValueOnce(jsonResponse({ authorize_url: 'https://www.facebook.com/v20.0/dialog/oauth?...' }))
    const apiClient = makeClient(fetchFn)

    const googleUrl = await apiClient.getGoogleOAuthUrl('client-1')
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/clients/client-1/google/oauth/start',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(googleUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth?...')

    const metaUrl = await apiClient.getMetaOAuthUrl('client-1')
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/clients/client-1/meta/oauth/start',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(metaUrl).toBe('https://www.facebook.com/v20.0/dialog/oauth?...')
  })

  it('setGoogleAdAccount and setMetaAdAccount PUT to the ad-account routes', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'client-1',
          name: 'Acme Bakery',
          google_ads_customer_id: '123-456-7890',
          meta_ad_account_id: null,
          google_connected: true,
          meta_connected: false,
          logo_url: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'client-1',
          name: 'Acme Bakery',
          google_ads_customer_id: null,
          meta_ad_account_id: 'act_999',
          google_connected: false,
          meta_connected: true,
          logo_url: null,
        }),
      )
    const apiClient = makeClient(fetchFn)

    const googleResult = await apiClient.setGoogleAdAccount('client-1', '123-456-7890')
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/clients/client-1/google/ad-account',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ customer_id: '123-456-7890' }) }),
    )
    expect(googleResult.googleAdsCustomerId).toBe('123-456-7890')

    const metaResult = await apiClient.setMetaAdAccount('client-1', 'act_999')
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/clients/client-1/meta/ad-account',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ ad_account_id: 'act_999' }) }),
    )
    expect(metaResult.metaAdAccountId).toBe('act_999')
  })

  it('uploadClientAsset posts multipart form data with the auth header, no Content-Type override', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'asset-1',
        kind: 'logo',
        filename: 'logo.png',
        url: '/uploads/client-1/abc.png',
        created_at: '2026-07-18T00:00:00Z',
      }),
    )
    const apiClient = makeClient(fetchFn)
    const file = new File(['fake-bytes'], 'logo.png', { type: 'image/png' })

    const asset = await apiClient.uploadClientAsset('client-1', 'logo', file)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://localhost:8000/clients/client-1/assets')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-123' })
    expect(init.body).toBeInstanceOf(FormData)
    expect(init.body.get('kind')).toBe('logo')
    expect(init.body.get('file')).toBe(file)
    expect(asset).toEqual({
      id: 'asset-1',
      kind: 'logo',
      filename: 'logo.png',
      url: '/uploads/client-1/abc.png',
      createdAt: '2026-07-18T00:00:00Z',
    })
  })

  it('deleteClientAsset DELETEs the asset route', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ status: 'deleted' }))
    const apiClient = makeClient(fetchFn)

    await apiClient.deleteClientAsset('client-1', 'asset-1')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/clients/client-1/assets/asset-1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('submitBriefsBatch posts an array of snake_case briefs and maps the drafts', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: 'draft-1',
          brief_id: 'brief-1',
          client_id: 'client-1',
          client_name: 'Acme Bakery',
          status: 'pending_generation',
          business_description: 'Bakery',
          budget_usd: 500,
          goals: 'Traffic',
          guardrail_flag_count: 0,
          has_blocking_flags: false,
          created_at: '2026-07-09T00:00:00Z',
        },
      ]),
    )
    const apiClient = makeClient(fetchFn)

    const drafts = await apiClient.submitBriefsBatch([
      { clientId: 'client-1', businessDescription: 'Bakery', budgetUsd: 500, goals: 'Traffic' },
    ])

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs/batch',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          briefs: [{ client_id: 'client-1', business_description: 'Bakery', budget_usd: 500, goals: 'Traffic' }],
        }),
      }),
    )
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ id: 'draft-1', clientName: 'Acme Bakery', status: 'pending_generation' })
  })

  it('submitBriefsBatch posts all optional targeting/scheduling fields', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([]))
    const apiClient = makeClient(fetchFn)

    await apiClient.submitBriefsBatch([
      {
        clientId: 'client-1',
        businessDescription: 'Bakery',
        budgetUsd: 500,
        goals: 'Traffic',
        websiteUrl: 'https://acmebakery.test',
        targetLocation: 'Austin, TX',
        targetAudience: 'Families within 5 miles',
        endDate: '2026-12-31',
        platforms: ['google'],
        competitors: 'Big Bakery Co',
        uniqueSellingPoints: 'Family recipes since 1990',
        excludedKeywords: ['free', 'cheap'],
      },
    ])

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs/batch',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          briefs: [
            {
              client_id: 'client-1',
              business_description: 'Bakery',
              budget_usd: 500,
              goals: 'Traffic',
              website_url: 'https://acmebakery.test',
              target_location: 'Austin, TX',
              target_audience: 'Families within 5 miles',
              end_date: '2026-12-31',
              platforms: ['google'],
              competitors: 'Big Bakery Co',
              unique_selling_points: 'Family recipes since 1990',
              excluded_keywords: ['free', 'cheap'],
            },
          ],
        }),
      }),
    )
  })

  it('listBriefs omits the query string when no clientId is given', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([]))
    const apiClient = makeClient(fetchFn)

    await apiClient.listBriefs()

    expect(fetchFn).toHaveBeenCalledWith('http://localhost:8000/briefs', expect.objectContaining({ method: 'GET' }))
  })

  it('listBriefs includes client_id when given', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([]))
    const apiClient = makeClient(fetchFn)

    await apiClient.listBriefs('client-1')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs?client_id=client-1',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('getBrief maps the full draft detail including guardrail and launches', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'draft-1',
        brief_id: 'brief-1',
        client_id: 'client-1',
        client_name: 'Acme Bakery',
        status: 'guardrail_checked',
        business_description: 'Bakery',
        budget_usd: 500,
        goals: 'Traffic',
        guardrail_flag_count: 1,
        has_blocking_flags: false,
        created_at: '2026-07-09T00:00:00Z',
        website_url: 'https://acmebakery.test',
        target_location: 'Austin, TX',
        target_audience: 'Families within 5 miles',
        end_date: '2026-12-31',
        platforms: ['google', 'meta'],
        competitors: 'Big Bakery Co',
        unique_selling_points: 'Family recipes since 1990',
        excluded_keywords: ['free'],
        google_plan: {
          campaign_name: 'Austin Bakery',
          daily_budget_micros: 16_500_000,
          end_date: null,
          final_url: 'https://acmebakery.test',
          negative_keywords: ['free'],
          ad_groups: [{ name: 'Primary', keywords: ['bakery'], headlines: ['Fresh'], descriptions: ['Visit today.'] }],
        },
        meta_plan: {
          campaign_name: 'Austin Bakery',
          objective: 'traffic',
          website_url: 'https://acmebakery.test',
          ad_sets: [
            {
              name: 'Primary',
              daily_budget_cents: 1650,
              targeting_description: 'Adults 25-54',
              creative_headline: 'Fresh',
              creative_body: 'Visit today.',
              call_to_action: 'Visit Us Today',
            },
          ],
        },
        guardrail: { id: 'gr-1', campaign_draft_id: 'draft-1', flags: [{ severity: 'warn', code: 'x', message: 'y' }], has_blocking_flags: false },
        launches: [{ platform: 'google', status: 'success', external_campaign_id: 'g-1', error_message: null }],
      }),
    )
    const apiClient = makeClient(fetchFn)

    const draft = await apiClient.getBrief('draft-1')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs/draft-1',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(draft.googlePlan?.campaignName).toBe('Austin Bakery')
    expect(draft.googlePlan?.finalUrl).toBe('https://acmebakery.test')
    expect(draft.googlePlan?.negativeKeywords).toEqual(['free'])
    expect(draft.metaPlan?.adSets[0].dailyBudgetCents).toBe(1650)
    expect(draft.metaPlan?.websiteUrl).toBe('https://acmebakery.test')
    expect(draft.guardrail?.flags).toEqual([{ severity: 'warn', code: 'x', message: 'y' }])
    expect(draft.launches).toEqual([
      { platform: 'google', status: 'success', externalCampaignId: 'g-1', errorMessage: null },
    ])
    expect(draft.websiteUrl).toBe('https://acmebakery.test')
    expect(draft.targetLocation).toBe('Austin, TX')
    expect(draft.targetAudience).toBe('Families within 5 miles')
    expect(draft.endDate).toBe('2026-12-31')
    expect(draft.platforms).toEqual(['google', 'meta'])
    expect(draft.competitors).toBe('Big Bakery Co')
    expect(draft.uniqueSellingPoints).toBe('Family recipes since 1990')
    expect(draft.excludedKeywords).toEqual(['free'])
  })

  it('getBrief maps projected_metrics when present', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'draft-1',
        brief_id: 'brief-1',
        client_id: 'client-1',
        client_name: 'Acme Bakery',
        status: 'adapted',
        business_description: 'Bakery',
        budget_usd: 500,
        goals: 'Traffic',
        guardrail_flag_count: 0,
        has_blocking_flags: false,
        created_at: '2026-07-09T00:00:00Z',
        google_plan: null,
        meta_plan: null,
        guardrail: null,
        launches: [],
        projected_metrics: {
          platforms: [
            { platform: 'google', daily_budget_usd: 10, estimated_daily_clicks: 5, estimated_daily_impressions: 250 },
          ],
          estimated_location_reach: 7500,
        },
      }),
    )
    const apiClient = makeClient(fetchFn)

    const draft = await apiClient.getBrief('draft-1')

    expect(draft.projectedMetrics).toEqual({
      platforms: [{ platform: 'google', dailyBudgetUsd: 10, estimatedDailyClicks: 5, estimatedDailyImpressions: 250 }],
      estimatedLocationReach: 7500,
    })
  })

  it('getBrief maps a null projected_metrics', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'draft-1',
        brief_id: 'brief-1',
        client_id: 'client-1',
        client_name: 'Acme Bakery',
        status: 'pending_generation',
        business_description: 'Bakery',
        budget_usd: 500,
        goals: 'Traffic',
        guardrail_flag_count: 0,
        has_blocking_flags: false,
        created_at: '2026-07-09T00:00:00Z',
        google_plan: null,
        meta_plan: null,
        guardrail: null,
        launches: [],
        projected_metrics: null,
      }),
    )
    const apiClient = makeClient(fetchFn)

    const draft = await apiClient.getBrief('draft-1')

    expect(draft.projectedMetrics).toBeNull()
  })

  it('generateDraft posts and maps mode + both plans', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'draft-1',
        brief_id: 'brief-1',
        status: 'adapted',
        mode: 'demo',
        google_plan: {
          campaign_name: 'Austin Bakery',
          daily_budget_micros: 16_500_000,
          end_date: null,
          final_url: null,
          negative_keywords: [],
          ad_groups: [],
        },
        meta_plan: {
          campaign_name: 'Austin Bakery',
          objective: 'traffic',
          website_url: null,
          ad_sets: [],
        },
      }),
    )
    const apiClient = makeClient(fetchFn)

    const result = await apiClient.generateDraft('draft-1')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs/draft-1/generate',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result.mode).toBe('demo')
    expect(result.googlePlan?.campaignName).toBe('Austin Bakery')
  })

  it('runGuardrails posts and maps the flag report', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'gr-1',
        campaign_draft_id: 'draft-1',
        flags: [{ severity: 'block', code: 'banned_term', message: 'Uses a banned term.' }],
        has_blocking_flags: true,
      }),
    )
    const apiClient = makeClient(fetchFn)

    const report = await apiClient.runGuardrails('draft-1')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs/draft-1/guardrails/run',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(report.hasBlockingFlags).toBe(true)
    expect(report.flags[0]).toEqual({ severity: 'block', code: 'banned_term', message: 'Uses a banned term.' })
  })

  it('approveDraft and rejectDraft post the decision and an optional reviewer note', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => jsonResponse({ status: 'approved' }))
    const apiClient = makeClient(fetchFn)

    await apiClient.approveDraft('draft-1', 'Looks good')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs/draft-1/approve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ decision: 'approved', reviewer_note: 'Looks good' }),
      }),
    )

    await apiClient.rejectDraft('draft-1')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs/draft-1/approve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ decision: 'rejected', reviewer_note: null }),
      }),
    )
  })

  it('launchDraft maps the full per-platform response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        status: 'launched',
        external_campaign_id: 'google-camp-1',
        error_message: null,
        platforms: [
          { platform: 'google', status: 'success', external_campaign_id: 'google-camp-1', error_message: null },
          { platform: 'meta', status: 'failed', external_campaign_id: null, error_message: 'Not connected' },
        ],
      }),
    )
    const apiClient = makeClient(fetchFn)

    const result = await apiClient.launchDraft('draft-1')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs/draft-1/launch',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result.platforms).toEqual([
      { platform: 'google', status: 'success', externalCampaignId: 'google-camp-1', errorMessage: null },
      { platform: 'meta', status: 'failed', externalCampaignId: null, errorMessage: 'Not connected' },
    ])
  })

  it('listAuditLog defaults the limit to 100 and maps entries', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse([
        { id: 'audit-1', client_id: 'client-1', event_type: 'brief.submitted', payload: { brief_id: 'brief-1' }, created_at: '2026-07-09T00:00:00Z' },
      ]),
    )
    const apiClient = makeClient(fetchFn)

    const entries = await apiClient.listAuditLog()

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/audit-log?limit=100',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(entries[0]).toEqual({
      id: 'audit-1',
      clientId: 'client-1',
      eventType: 'brief.submitted',
      payload: { brief_id: 'brief-1' },
      createdAt: '2026-07-09T00:00:00Z',
    })
  })

  it('listNotifications maps snake_case fields to camelCase', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse([
        { draft_id: 'draft-1', client_name: 'Acme Bakery', kind: 'pending_approval_stale', days_stale: 32 },
      ]),
    )
    const apiClient = makeClient(fetchFn)

    const notifications = await apiClient.listNotifications()

    expect(fetchFn).toHaveBeenCalledWith('http://localhost:8000/notifications', expect.objectContaining({ method: 'GET' }))
    expect(notifications).toEqual([
      { draftId: 'draft-1', clientName: 'Acme Bakery', kind: 'pending_approval_stale', daysStale: 32 },
    ])
  })

  it('getImpactStats maps snake_case fields to camelCase', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({ campaigns_launched: 12, estimated_hours_saved: 6.5, guardrail_issues_caught: 3 }),
    )
    const apiClient = makeClient(fetchFn)

    const stats = await apiClient.getImpactStats()

    expect(fetchFn).toHaveBeenCalledWith('http://localhost:8000/stats/impact', expect.objectContaining({ method: 'GET' }))
    expect(stats).toEqual({ campaignsLaunched: 12, estimatedHoursSaved: 6.5, guardrailIssuesCaught: 3 })
  })

  it('throws with the response body text when the backend returns an error status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('Client not found', { status: 404 }))
    const apiClient = makeClient(fetchFn)

    await expect(apiClient.getClient('client-1')).rejects.toThrow('Client not found')
  })
})
