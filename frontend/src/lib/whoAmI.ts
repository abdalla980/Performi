import type { WhoAmI } from './types'

// The backend rejected the request as unauthenticated (401). Retrying won't help.
export class WhoAmIUnauthorizedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WhoAmIUnauthorizedError'
  }
}

// The backend accepted the Supabase token but has no agency or client row for that
// user (e.g. an account that exists in Supabase but was never linked in this
// environment's database). Signing out and retrying can't fix that, so callers
// should explain it rather than treat it like an expired session.
export class AccountNotLinkedError extends WhoAmIUnauthorizedError {
  constructor() {
    super('No agency or client linked to this Supabase account')
    this.name = 'AccountNotLinkedError'
  }
}

interface FetchWhoAmIOptions {
  baseUrl: string
  token: string
  fetchFn?: typeof fetch
}

interface RawWhoAmI {
  role: WhoAmI['role']
  id: string
  name: string
  agency_name: string | null
}

export async function fetchWhoAmI({ baseUrl, token, fetchFn = fetch }: FetchWhoAmIOptions): Promise<WhoAmI> {
  const response = await fetchFn(`${baseUrl}/whoami`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const body = await response.text()
    if (response.status === 401) {
      throw body.includes('No agency or client linked') ? new AccountNotLinkedError() : new WhoAmIUnauthorizedError(body)
    }
    throw new Error(body)
  }
  const raw = (await response.json()) as RawWhoAmI
  return { role: raw.role, id: raw.id, name: raw.name, agencyName: raw.agency_name }
}
