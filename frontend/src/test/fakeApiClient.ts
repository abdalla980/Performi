import { vi } from 'vitest'
import type { ApiClient } from '../lib/types'

function notImplemented(name: string) {
  return vi.fn(async () => {
    throw new Error(`${name} not implemented in this test`)
  })
}

export function createFakeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getConfigStatus: notImplemented('getConfigStatus'),
    listClients: notImplemented('listClients'),
    createClient: notImplemented('createClient'),
    getClient: notImplemented('getClient'),
    deleteClient: notImplemented('deleteClient'),
    setBrandVoice: notImplemented('setBrandVoice'),
    connectGoogleDemo: notImplemented('connectGoogleDemo'),
    connectMetaDemo: notImplemented('connectMetaDemo'),
    getGoogleOAuthUrl: notImplemented('getGoogleOAuthUrl'),
    getMetaOAuthUrl: notImplemented('getMetaOAuthUrl'),
    setGoogleAdAccount: notImplemented('setGoogleAdAccount'),
    setMetaAdAccount: notImplemented('setMetaAdAccount'),
    uploadClientAsset: notImplemented('uploadClientAsset'),
    deleteClientAsset: notImplemented('deleteClientAsset'),
    submitBriefsBatch: notImplemented('submitBriefsBatch'),
    listBriefs: notImplemented('listBriefs'),
    getBrief: notImplemented('getBrief'),
    generateDraft: notImplemented('generateDraft'),
    runGuardrails: notImplemented('runGuardrails'),
    approveDraft: notImplemented('approveDraft'),
    rejectDraft: notImplemented('rejectDraft'),
    launchDraft: notImplemented('launchDraft'),
    listNotifications: notImplemented('listNotifications'),
    getImpactStats: notImplemented('getImpactStats'),
    listAuditLog: notImplemented('listAuditLog'),
    ...overrides,
  } as ApiClient
}
