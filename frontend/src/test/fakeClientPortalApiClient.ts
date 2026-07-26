import { vi } from 'vitest'
import type { ClientPortalApiClient } from '../lib/types'

function notImplemented(name: string) {
  return vi.fn(async () => {
    throw new Error(`${name} not implemented in this test`)
  })
}

export function createFakeClientPortalApiClient(overrides: Partial<ClientPortalApiClient> = {}): ClientPortalApiClient {
  return {
    listCampaigns: notImplemented('listCampaigns'),
    getCampaign: notImplemented('getCampaign'),
    decideCampaign: notImplemented('decideCampaign'),
    flagLaunchIssue: notImplemented('flagLaunchIssue'),
    ...overrides,
  } as ClientPortalApiClient
}
