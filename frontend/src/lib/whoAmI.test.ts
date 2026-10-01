import { describe, expect, it, vi } from 'vitest'
import { AccountNotLinkedError, fetchWhoAmI } from './whoAmI'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('fetchWhoAmI', () => {
  it('sends the bearer token and returns the parsed role', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ role: 'agency', id: 'agency-1', name: 'Acme', agency_name: null }))

    const result = await fetchWhoAmI({ baseUrl: 'http://localhost:8000', token: 'token-123', fetchFn })

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/whoami',
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    )
    expect(result).toEqual({ role: 'agency', id: 'agency-1', name: 'Acme', agencyName: null })
  })

  it('maps agency_name to agencyName for a client role', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ role: 'client', id: 'client-1', name: 'Acme Bakery', agency_name: 'Acme Agency' }))

    const result = await fetchWhoAmI({ baseUrl: 'http://localhost:8000', token: 'token-123', fetchFn })

    expect(result).toEqual({ role: 'client', id: 'client-1', name: 'Acme Bakery', agencyName: 'Acme Agency' })
  })

  it('throws with the response body text on a non-ok response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('No agency or client linked', { status: 401 }))

    await expect(fetchWhoAmI({ baseUrl: 'http://localhost:8000', token: 'bad-token', fetchFn })).rejects.toThrow(
      'No agency or client linked',
    )
  })

  it('throws AccountNotLinkedError when the token is valid but no agency or client is linked', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: 'No agency or client linked to this Supabase account' }, 401))

    await expect(fetchWhoAmI({ baseUrl: 'http://localhost:8000', token: 'token-123', fetchFn })).rejects.toBeInstanceOf(
      AccountNotLinkedError,
    )
  })

  it('does not treat an invalid token as an unlinked account', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ detail: 'Invalid token' }, 401))

    const error = await fetchWhoAmI({ baseUrl: 'http://localhost:8000', token: 'bad', fetchFn }).catch((e) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(AccountNotLinkedError)
  })
})
