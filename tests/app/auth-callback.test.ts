import { describe, it, expect, vi, beforeEach } from 'vitest'

const { exchangeCodeForSession, getUser, authSignOut, createOwnProfile } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  authSignOut: vi.fn(),
  createOwnProfile: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  serverClient: async () => ({ auth: { exchangeCodeForSession, getUser, signOut: authSignOut } }),
}))
vi.mock('@/lib/auth/create-own-profile', () => ({ createOwnProfile }))
// The request's cookies, and what the route sets on its response, through next/headers' cookies().
let jar = new Map<string, string>()
const setCookie = vi.fn()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (...args: unknown[]) => setCookie(...args),
  }),
}))

import { GET } from '@/app/(auth)/callback/route'

const request = (next?: string) => {
  jar = new Map(next === undefined ? [] : [['sign-in-next', next]])
  return new Request('https://www.dwellduel.com/callback?code=abc')
}
const user = { id: 'u1', email: 'mo@example.com', user_metadata: {} }

beforeEach(() => {
  exchangeCodeForSession.mockReset().mockResolvedValue({ error: null })
  getUser.mockReset().mockResolvedValue({ data: { user } })
  authSignOut.mockReset().mockResolvedValue({ error: null })
  createOwnProfile.mockReset()
  setCookie.mockReset()
})

describe('auth callback (#194)', () => {
  it('lets an invited member in without signing anything out', async () => {
    createOwnProfile.mockResolvedValue({ ok: true })
    const res = await GET(request())
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/')
    expect(authSignOut).not.toHaveBeenCalled()
  })

  it('signs out only this device when the member isn’t invited', async () => {
    createOwnProfile.mockResolvedValue({ ok: false, reason: 'not_invited' })
    const res = await GET(request())
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/not-invited')
    expect(authSignOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('signs out only this device on a profile error, leaving other devices signed in', async () => {
    createOwnProfile.mockResolvedValue({ ok: false, reason: 'error' })
    const res = await GET(request())
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/sign-in?error=auth')
    expect(authSignOut).toHaveBeenCalledTimes(1)
    expect(authSignOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('sends the member where they were going, from the sign-in page’s cookie, and clears it (#263)', async () => {
    createOwnProfile.mockResolvedValue({ ok: true })
    const res = await GET(request('/markets/abc?from=share'))
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/markets/abc?from=share')
    expect(setCookie).toHaveBeenCalledWith('sign-in-next', '', { path: '/callback', maxAge: 0 })
  })

  it.each([
    ['another site', '//evil.example/markets'],
    ['a backslash', '/\\evil.example'],
    ['an absolute URL', 'https://evil.example/'],
    ['a public page', '/not-invited'],
  ])('ignores a cookie naming %s, and goes Home', async (_, next) => {
    createOwnProfile.mockResolvedValue({ ok: true })
    const res = await GET(request(next))
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/')
  })

  it('keeps the destination on a failed sign-in, so trying again still lands there', async () => {
    createOwnProfile.mockResolvedValue({ ok: false, reason: 'error' })
    const res = await GET(request('/tasks'))
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/sign-in?error=auth&next=%2Ftasks')
  })

  it('names the refused account to /not-invited in a short-lived httpOnly cookie, never the URL, and keeps the destination', async () => {
    createOwnProfile.mockResolvedValue({ ok: false, reason: 'not_invited' })
    const res = await GET(request('/markets/abc'))
    const location = res.headers.get('location')!
    expect(location).toBe('https://www.dwellduel.com/not-invited?next=%2Fmarkets%2Fabc')
    expect(location).not.toContain('mo%40example.com')
    expect(location).not.toContain('mo@example.com')
    expect(setCookie).toHaveBeenCalledWith('not-invited-email', 'mo@example.com', {
      path: '/not-invited',
      maxAge: 300,
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    })
  })
})
