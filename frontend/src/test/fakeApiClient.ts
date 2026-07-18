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
    setBrandVoice: notImplemented('setBrandVoice'),
    connectGoogleDemo: notImplemented('connectGoogleDemo'),
    connectMetaDemo: notImplemented('connectMetaDemo'),
    getGoogleOAuthUrl: notImplemented('getGoogleOAuthUrl'),
    getMetaOAuthUrl: notImplemented('getMetaOAuthUrl'),
    submitBriefsBatch: notImplemented('submitBriefsBatch'),
    listBriefs: notImplemented('listBriefs'),
    getBrief: notImplemented('getBrief'),
    generateDraft: notImplemented('generateDraft'),
    runGuardrails: notImplemented('runGuardrails'),
    approveDraft: notImplemented('approveDraft'),
    rejectDraft: notImplemented('rejectDraft'),
    launchDraft: notImplemented('launchDraft'),
    listAuditLog: notImplemented('listAuditLog'),
    ...overrides,
  } as ApiClient
}
