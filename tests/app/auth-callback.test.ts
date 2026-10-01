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

import { GET } from '@/app/(auth)/callback/route'

const request = (cookie?: string) =>
  new Request('https://www.dwellduel.com/callback?code=abc', cookie ? { headers: { cookie } } : undefined)
const user = { id: 'u1', email: 'mo@example.com', user_metadata: {} }

beforeEach(() => {
  exchangeCodeForSession.mockReset().mockResolvedValue({ error: null })
  getUser.mockReset().mockResolvedValue({ data: { user } })
  authSignOut.mockReset().mockResolvedValue({ error: null })
  createOwnProfile.mockReset()
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
    const res = await GET(request(`theme=dark; sign-in-next=${encodeURIComponent('/markets/abc?from=share')}`))
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/markets/abc?from=share')
    expect(res.headers.get('set-cookie')).toMatch(/sign-in-next=;.*Max-Age=0/i)
  })

  it.each([
    ['another site', '//evil.example/markets'],
    ['a backslash', '/\\evil.example'],
    ['an absolute URL', 'https://evil.example/'],
    ['a public page', '/not-invited'],
  ])('ignores a cookie naming %s, and goes Home', async (_, next) => {
    createOwnProfile.mockResolvedValue({ ok: true })
    const res = await GET(request(`sign-in-next=${encodeURIComponent(next)}`))
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/')
  })

  it('keeps the destination on a failed sign-in, so trying again still lands there', async () => {
    createOwnProfile.mockResolvedValue({ ok: false, reason: 'error' })
    const res = await GET(request(`sign-in-next=${encodeURIComponent('/tasks')}`))
    expect(res.headers.get('location')).toBe('https://www.dwellduel.com/sign-in?error=auth&next=%2Ftasks')
  })
})
