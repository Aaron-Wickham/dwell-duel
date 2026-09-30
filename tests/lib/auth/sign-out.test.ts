import { describe, it, expect, vi, beforeEach } from 'vitest'

const { authSignOut, redirect } = vi.hoisted(() => ({ authSignOut: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ serverClient: async () => ({ auth: { signOut: authSignOut } }) }))
vi.mock('next/navigation', () => ({ redirect }))

import { signOut } from '@/lib/auth/sign-out'

beforeEach(() => {
  authSignOut.mockReset().mockResolvedValue({ error: null })
  redirect.mockReset()
})

describe('signOut (#194)', () => {
  it('signs out only this device, then goes to sign-in', async () => {
    await signOut()
    expect(authSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(redirect).toHaveBeenCalledWith('/sign-in')
  })
})
