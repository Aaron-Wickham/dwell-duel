import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthApiError, AuthInvalidJwtError, AuthRetryableFetchError, AuthSessionMissingError, AuthUnknownError } from '@supabase/supabase-js'

const { getClaims, supabase } = vi.hoisted(() => {
  const getClaims = vi.fn()
  return { getClaims, supabase: { auth: { getClaims } } }
})
vi.mock('@/lib/supabase/server', () => ({ serverClient: async () => supabase }))

import { requireUser } from '@/lib/auth/require-user'
import { AuthUnavailableError } from '@/lib/auth/auth-unavailable'

beforeEach(() => {
  getClaims.mockReset()
})

describe('requireUser', () => {
  it('builds a user from the claims', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'member-1', email: 'a@example.com' } }, error: null })

    const { user, supabase: returnedClient } = await requireUser()

    expect(user).toEqual({ id: 'member-1', email: 'a@example.com' })
    expect(returnedClient).toBe(supabase)
  })

  it('builds a user with no email claim', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'member-1' } }, error: null })
    const { user } = await requireUser()
    expect(user).toEqual({ id: 'member-1', email: undefined })
  })

  it('returns a null user with no session', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })
    const { user } = await requireUser()
    expect(user).toBeNull()
  })

  it('returns a null user when claims verify but carry no sub', async () => {
    getClaims.mockResolvedValue({ data: { claims: {} }, error: null })
    const { user } = await requireUser()
    expect(user).toBeNull()
  })

  it('returns a null user rather than throwing when a malformed access-token cookie makes getClaims throw', async () => {
    getClaims.mockRejectedValue(new SyntaxError('bad token'))
    const { user } = await requireUser()
    expect(user).toBeNull()
  })

  it('returns a null user for a session-missing error', async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthSessionMissingError() })
    const { user } = await requireUser()
    expect(user).toBeNull()
  })

  it('returns a null user for a 4xx auth api error (a revoked or unknown refresh token)', async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthApiError('invalid_grant', 400, 'refresh_token_not_found') })
    const { user } = await requireUser()
    expect(user).toBeNull()
  })

  it('returns a null user for an invalid JWT', async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthInvalidJwtError('bad jwt') })
    const { user } = await requireUser()
    expect(user).toBeNull()
  })

  it('throws AuthUnavailableError for a retryable fetch error (network, timeout, 5xx)', async () => {
    const cause = new AuthRetryableFetchError('network down', 0)
    getClaims.mockResolvedValue({ data: null, error: cause })
    await expect(requireUser()).rejects.toMatchObject({ name: 'AuthUnavailableError', cause })
  })

  it('throws AuthUnavailableError for a 5xx auth api error', async () => {
    const cause = new AuthApiError('server error', 500, undefined)
    getClaims.mockResolvedValue({ data: null, error: cause })
    await expect(requireUser()).rejects.toBeInstanceOf(AuthUnavailableError)
  })

  it('throws AuthUnavailableError for a 429 auth api error (rate limited)', async () => {
    const cause = new AuthApiError('too many requests', 429, undefined)
    getClaims.mockResolvedValue({ data: null, error: cause })
    await expect(requireUser()).rejects.toBeInstanceOf(AuthUnavailableError)
  })

  it('throws AuthUnavailableError for an unknown auth error', async () => {
    const cause = new AuthUnknownError('mystery', new Error('inner'))
    getClaims.mockResolvedValue({ data: null, error: cause })
    await expect(requireUser()).rejects.toBeInstanceOf(AuthUnavailableError)
  })
})
