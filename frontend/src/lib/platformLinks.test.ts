import { describe, expect, it } from 'vitest'
import { buildPlatformManageUrl, PLATFORM_LABEL } from './platformLinks'

describe('buildPlatformManageUrl', () => {
  it('returns Google Ads overview for google', () => {
    expect(buildPlatformManageUrl('google', { externalCampaignId: '123' })).toBe(
      'https://ads.google.com/aw/overview',
    )
  })

  it('returns Meta campaign deep link when account and campaign are real', () => {
    expect(
      buildPlatformManageUrl('meta', {
        externalCampaignId: '987654321',
        metaAdAccountId: 'act_111',
      }),
    ).toBe(
      'https://business.facebook.com/adsmanager/manage/campaigns?act=act_111&selected_campaign_ids=987654321',
    )
  })

  it('prefixes act_ when Meta ad account id omits it', () => {
    expect(
      buildPlatformManageUrl('meta', {
        externalCampaignId: '987654321',
        metaAdAccountId: '111',
      }),
    ).toContain('act=act_111')
  })

  it('falls back to account-level Meta URL for demo campaigns', () => {
    expect(
      buildPlatformManageUrl('meta', {
        externalCampaignId: 'demo-fake0001',
        metaAdAccountId: 'act_111',
      }),
    ).toBe('https://adsmanager.facebook.com/adsmanager/')
  })

  it('exposes platform labels', () => {
    expect(PLATFORM_LABEL.google).toBe('Google Ads')
    expect(PLATFORM_LABEL.meta).toBe('Meta Ads Manager')
  })
})
