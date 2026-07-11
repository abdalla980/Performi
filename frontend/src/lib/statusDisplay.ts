import type { CampaignDraftStatus } from './types'

export const STATUS_LABELS: Record<CampaignDraftStatus, string> = {
  pending_generation: 'Pending generation',
  adapted: 'Generated',
  guardrail_checked: 'Needs review',
  approved: 'Approved',
  rejected: 'Rejected',
  launched: 'Launched',
  failed: 'Failed',
}

export const STATUS_BADGE_VARIANT: Record<CampaignDraftStatus, 'default' | 'success' | 'destructive'> = {
  pending_generation: 'default',
  adapted: 'default',
  guardrail_checked: 'default',
  approved: 'success',
  rejected: 'destructive',
  launched: 'success',
  failed: 'destructive',
}
