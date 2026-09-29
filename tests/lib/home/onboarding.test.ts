import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbClient } from '@/lib/supabase/database'

const jar = { get: vi.fn(), set: vi.fn() }
vi.mock('next/headers', () => ({ cookies: async () => jar }))

import { getOnboarding, ONBOARDING_COOKIE, ONBOARDING_DISMISSED } from '@/lib/home/onboarding'
import { dismissOnboardingAction } from '@/lib/home/dismiss-onboarding'

// Each table answers with its count; every query is head-only.
function client(counts: Record<string, number>) {
  const options: unknown[] = []
  const from = vi.fn((table: string) => {
    const builder = {
      select: (_columns: string, opts: unknown) => {
        options.push(opts)
        return builder
      },
      eq: () => builder,
      not: () => builder,
      then: <T>(resolve: (value: { count: number; error: null }) => T) => resolve({ count: counts[table] ?? 0, error: null }),
    }
    return builder
  })
  return { supabase: { from } as unknown as DbClient, from, options }
}

beforeEach(() => {
  jar.get.mockReset()
  jar.set.mockReset()
})

describe('getOnboarding', () => {
  it('reads each step from real data with head-only counts', async () => {
    const { supabase, options } = client({ profiles: 1, task_completions: 2 })
    expect(await getOnboarding(supabase, 'me')).toEqual({ photo: true, bet: false, task: true })
    expect(options).toHaveLength(5)
    for (const opts of options) expect(opts).toEqual({ count: 'exact', head: true })
  })

  it.each(['bets', 'cancelled_bets', 'parlays'])('counts a row in %s as a first bet', async (table) => {
    const { supabase } = client({ [table]: 1 })
    expect((await getOnboarding(supabase, 'me'))?.bet).toBe(true)
  })

  it('reads nothing once dismissed', async () => {
    jar.get.mockImplementation((name: string) => (name === ONBOARDING_COOKIE ? { value: ONBOARDING_DISMISSED } : undefined))
    const { supabase, from } = client({})
    expect(await getOnboarding(supabase, 'me')).toBeNull()
    expect(from).not.toHaveBeenCalled()
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
