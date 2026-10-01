import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbClient } from '@/lib/supabase/database'

const jar = { get: vi.fn(), has: vi.fn(), set: vi.fn() }
vi.mock('next/headers', () => ({ cookies: async () => jar }))

import { getOnboarding, ONBOARDING_COOKIE, ONBOARDING_DISMISSED } from '@/lib/home/onboarding'
import { dismissOnboardingAction } from '@/lib/home/dismiss-onboarding'
import { HOW_IT_WORKS_READ_COOKIE } from '@/lib/home/how-it-works-read'

// my_onboarding (0071) answers the three steps in one row.
function client(steps: { photo: boolean; bet: boolean; task: boolean }) {
  const rpc = vi.fn(() => ({ single: async () => ({ data: steps, error: null }) }))
  return { supabase: { rpc } as unknown as DbClient, rpc }
}

beforeEach(() => {
  jar.get.mockReset()
  jar.has.mockReset().mockReturnValue(false)
  jar.set.mockReset()
})

describe('getOnboarding', () => {
  it('reads the three steps in one call', async () => {
    const { supabase, rpc } = client({ photo: true, bet: false, task: true })
    expect(await getOnboarding(supabase)).toEqual({ learn: false, photo: true, bet: false, task: true })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('my_onboarding')
  })

  it('counts How it works as read once its page has set the cookie (#260)', async () => {
    jar.has.mockImplementation((name: string) => name === HOW_IT_WORKS_READ_COOKIE)
    const { supabase } = client({ photo: false, bet: false, task: false })
    expect(await getOnboarding(supabase)).toEqual({ learn: true, photo: false, bet: false, task: false })
  })

  it('throws when the read fails, so Home shows its error page rather than a wrong checklist', async () => {
    const rpc = vi.fn(() => ({ single: async () => ({ data: null, error: new Error('down') }) }))
    await expect(getOnboarding({ rpc } as unknown as DbClient)).rejects.toThrow('down')
  })

  it('reads nothing once dismissed', async () => {
    jar.get.mockImplementation((name: string) => (name === ONBOARDING_COOKIE ? { value: ONBOARDING_DISMISSED } : undefined))
    const { supabase, rpc } = client({ photo: false, bet: false, task: false })
    expect(await getOnboarding(supabase)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('dismissOnboardingAction', () => {
  it('saves the dismissal as a long-lived cookie', async () => {
    await dismissOnboardingAction()
    expect(jar.set).toHaveBeenCalledWith(
      ONBOARDING_COOKIE,
      ONBOARDING_DISMISSED,
      expect.objectContaining({ path: '/', httpOnly: true, maxAge: 60 * 60 * 24 * 365 }),
    )
  })
})
