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

const request = () => new Request('https://www.dwellduel.com/callback?code=abc')
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
})
