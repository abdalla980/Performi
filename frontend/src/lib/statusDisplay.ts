import type { CampaignDraftStatus } from './types'

export const STATUS_LABELS: Record<CampaignDraftStatus, string> = {
  pending_generation: 'Pending generation',
  adapted: 'Generated',
  guardrail_checked: 'Needs review',
  approved: 'Awaiting client approval',
  rejected: 'Rejected',
  client_approved: 'Client approved',
  client_rejected: 'Client rejected',
  launched: 'Launched',
  failed: 'Failed',
}

export const STATUS_BADGE_VARIANT: Record<CampaignDraftStatus, 'default' | 'success' | 'destructive'> = {
  pending_generation: 'default',
  adapted: 'default',
  guardrail_checked: 'default',
  approved: 'default',
  rejected: 'destructive',
  client_approved: 'success',
  client_rejected: 'destructive',
  launched: 'success',
  failed: 'destructive',
}
