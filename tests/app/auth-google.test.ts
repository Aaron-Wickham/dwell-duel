import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'

const { signInWithIdToken, authSignOut, createOwnProfile, reportError } = vi.hoisted(() => ({
  signInWithIdToken: vi.fn(),
  authSignOut: vi.fn(),
  createOwnProfile: vi.fn(),
  reportError: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  serverClient: async () => ({ auth: { signInWithIdToken, signOut: authSignOut } }),
}))
vi.mock('@/lib/auth/create-own-profile', () => ({ createOwnProfile }))
vi.mock('@/lib/observability/report', () => ({ reportError }))
let jar = new Map<string, string>()
const setCookie = vi.fn()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (...args: unknown[]) => setCookie(...args),
  }),
}))

import { POST } from '@/app/(auth)/auth/google/route'

const RAW_NONCE = 'raw-nonce-value'
const hashed = (raw: string) => createHash('sha256').update(raw).digest('hex')
// An ID token's shape: only the payload's nonce matters before Supabase checks the rest.
const token = (nonce: string | undefined) =>
  ['header', Buffer.from(JSON.stringify({ sub: '1', nonce })).toString('base64url'), 'signature'].join('.')

function request({
  credential = token(hashed(RAW_NONCE)),
  csrfBody = 'csrf-1',
  cookies = { g_csrf_token: 'csrf-1', 'google-nonce': RAW_NONCE } as Record<string, string>,
}: { credential?: string | null; csrfBody?: string | null; cookies?: Record<string, string> } = {}) {
  jar = new Map(Object.entries(cookies))
  const body = new URLSearchParams()
  if (credential !== null) body.set('credential', credential)
  if (csrfBody !== null) body.set('g_csrf_token', csrfBody)
  return new Request('https://www.dwellduel.com/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
}

const user = { id: 'u1', email: 'mo@example.com', user_metadata: { full_name: 'Mo' } }

beforeEach(() => {
  signInWithIdToken.mockReset().mockResolvedValue({ data: { user, session: {} }, error: null })
  authSignOut.mockReset().mockResolvedValue({ error: null })
  createOwnProfile.mockReset().mockResolvedValue({ ok: true })
  reportError.mockReset()
  setCookie.mockReset()
})

describe('POST /auth/google', () => {
  it('signs in with the ID token and the raw nonce, and goes Home with a 303', async () => {
    const res = await POST(request())
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/')
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: token(hashed(RAW_NONCE)), nonce: RAW_NONCE })
    expect(createOwnProfile).toHaveBeenCalledWith(expect.anything(), 'u1', 'mo@example.com', 'Mo', null)
    expect(authSignOut).not.toHaveBeenCalled()
  })

  it('goes where the member was headed, and spends the nonce and next cookies', async () => {
    const res = await POST(request({ cookies: { g_csrf_token: 'csrf-1', 'google-nonce': RAW_NONCE, 'sign-in-next': '/markets/abc?from=share' } }))
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/markets/abc?from=share')
    const options = { path: '/auth/google', httpOnly: true, sameSite: 'none', secure: true, maxAge: 0 }
    expect(setCookie).toHaveBeenCalledWith('google-nonce', '', options)
    expect(setCookie).toHaveBeenCalledWith('sign-in-next', '', options)
  })

  it('ignores a next cookie that would leave the site', async () => {
    const res = await POST(request({ cookies: { g_csrf_token: 'csrf-1', 'google-nonce': RAW_NONCE, 'sign-in-next': '//evil.example' } }))
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/')
  })

  it('sends an account that isn’t invited to /not-invited, signed out, with the email in a cookie and next in the URL', async () => {
    createOwnProfile.mockResolvedValue({ ok: false, reason: 'not_invited' })
    const res = await POST(request({ cookies: { g_csrf_token: 'csrf-1', 'google-nonce': RAW_NONCE, 'sign-in-next': '/tasks' } }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/not-invited?next=%2Ftasks')
    expect(authSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(setCookie).toHaveBeenCalledWith('not-invited-email', 'mo@example.com', {
      path: '/not-invited',
      maxAge: 300,
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    })
  })

  it('signs this device out and says so when the profile can’t be made', async () => {
    createOwnProfile.mockResolvedValue({ ok: false, reason: 'error' })
    const res = await POST(request({ cookies: { g_csrf_token: 'csrf-1', 'google-nonce': RAW_NONCE, 'sign-in-next': '/tasks' } }))
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/sign-in?error=auth&next=%2Ftasks')
    expect(authSignOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it.each([
    ['no CSRF cookie', { cookies: { 'google-nonce': RAW_NONCE } }],
    ['no CSRF token in the body', { csrfBody: null }],
    ['a CSRF token that doesn’t match the cookie', { csrfBody: 'csrf-2' }],
    ['no credential', { credential: null }],
  ])('refuses %s without asking Supabase', async (_, options) => {
    const res = await POST(request(options))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/sign-in?error=auth')
    expect(signInWithIdToken).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledOnce()
  })

  it.each([
    ['no nonce cookie (the page was left too long)', { cookies: { g_csrf_token: 'csrf-1' } }],
    ['a token minted for another nonce (another tab)', { credential: token(hashed('other')) }],
    ['a token with no nonce', { credential: token(undefined) }],
    ['a token that isn’t a JWT', { credential: 'garbage' }],
  ])('says the sign-in expired for %s, without asking Supabase', async (_, options) => {
    const res = await POST(request(options))
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/sign-in?error=expired')
    expect(signInWithIdToken).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledOnce()
  })

  it('reports a Supabase error and goes back to sign-in, keeping next', async () => {
    signInWithIdToken.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Bad ID token', code: 'bad_jwt' } })
    const res = await POST(request({ cookies: { g_csrf_token: 'csrf-1', 'google-nonce': RAW_NONCE, 'sign-in-next': '/feed' } }))
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/sign-in?error=auth&next=%2Ffeed')
    expect(reportError).toHaveBeenCalledWith('Sign-in with Google: signInWithIdToken failed', expect.anything())
    expect(createOwnProfile).not.toHaveBeenCalled()
  })

  it('never reports the token itself', async () => {
    await POST(request({ csrfBody: 'csrf-2' }))
    expect(JSON.stringify(reportError.mock.calls.map(([context, error]) => [context, String(error)]))).not.toContain('signature')
  })
})
