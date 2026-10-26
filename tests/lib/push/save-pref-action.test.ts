import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, upsert } = vi.hoisted(() => {
  const upsert = vi.fn()
  return { upsert, supabase: { from: vi.fn(() => ({ upsert })) } }
})
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

import { saveNotificationPrefAction } from '@/lib/push/actions'
import type { NotificationKind } from '@/lib/push/prefs'

beforeEach(() => {
  upsert.mockReset().mockResolvedValue({ error: null })
})

describe('saveNotificationPrefAction', () => {
  // Only the ticked column, so a new row takes the defaults for the rest and two quick ticks can't undo each other.
  it('saves only the choice that changed', async () => {
    expect(await saveNotificationPrefAction('new_markets', true)).toEqual({})
    expect(upsert).toHaveBeenCalledWith(
      { profile_id: 'member-1', new_markets: true, updated_at: expect.any(String) },
      { onConflict: 'profile_id' },
    )
  })

  it('refuses a kind it doesn’t know without writing', async () => {
    const result = await saveNotificationPrefAction('profile_id' as NotificationKind, true)
    expect(result.error).toBeTruthy()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('says what to do when the save fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    upsert.mockResolvedValue({ error: { message: 'boom' } })
    expect(await saveNotificationPrefAction('results', false)).toEqual({
      error: 'Couldn’t save that choice. Check your connection and try again.',
    })
  })
})
