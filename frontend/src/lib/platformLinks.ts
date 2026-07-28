import type { Platform } from './types'

export function buildPlatformManageUrl(
  platform: Platform,
  options: { externalCampaignId?: string | null; metaAdAccountId?: string | null } = {},
): string {
  if (platform === 'google') {
    // No reliable ocid-free deep link to one specific campaign exists — account-level
    // is the correct, honest choice here, not a shortcut. Do not "improve" this later
    // without re-verifying Google's current deep-link support.
    return 'https://ads.google.com/aw/overview'
  }
  const { externalCampaignId, metaAdAccountId } = options
  if (externalCampaignId && metaAdAccountId && !externalCampaignId.startsWith('demo-')) {
    const account = metaAdAccountId.startsWith('act_') ? metaAdAccountId : `act_${metaAdAccountId}`
    return `https://business.facebook.com/adsmanager/manage/campaigns?act=${account}&selected_campaign_ids=${externalCampaignId}`
  }
  return 'https://adsmanager.facebook.com/adsmanager/'
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  google: 'Google Ads',
  meta: 'Meta Ads Manager',
}
