import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { sendPush, after } = vi.hoisted(() => ({ sendPush: vi.fn(), after: vi.fn() }))
vi.mock('@/lib/push/send', () => ({ sendPush }))
vi.mock('@/lib/supabase/service-role', () => ({ serviceRoleClient: vi.fn() }))
vi.mock('next/server', () => ({ after }))

import { afterAction, notifyMarketResult, notifyNewMarket, notifyTaskReviews, sendResolveReminders } from '@/lib/push/notify'
import type { DbClient } from '@/lib/supabase/database'

const dbReturning = (data: unknown, error: unknown = null) => {
  const rpc = vi.fn(async () => ({ data, error }))
  return { db: { rpc } as unknown as DbClient, rpc }
}

beforeEach(() => {
  sendPush.mockReset().mockResolvedValue({ sent: 1, removed: 0, failed: 0 })
  after.mockReset()
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('afterAction', () => {
  it('schedules the send after the response when push is set up', async () => {
    const task = vi.fn(async () => {})
    afterAction(task)
    expect(after).toHaveBeenCalledTimes(1)
    await after.mock.calls[0][0]()
    expect(task).toHaveBeenCalled()
  })

  it('schedules nothing without the VAPID keys', () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')
    afterAction(vi.fn())
    expect(after).not.toHaveBeenCalled()
  })

  it('logs a failed send instead of throwing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    afterAction(async () => {
      throw new Error('boom')
    })
    await expect(after.mock.calls[0][0]()).resolves.toBeUndefined()
    expect(log).toHaveBeenCalled()
  })
})

describe('notify', () => {
  it("words each bettor's result from the recipients the database picks", async () => {
    const { db, rpc } = dbReturning([
      { profile_id: 'alice', title: 'Will it rain?', status: 'resolved', outcome_label: 'No', is_override: false, won: 26, refunded: 0, has_solo: true },
      { profile_id: 'bob', title: 'Will it rain?', status: 'resolved', outcome_label: 'No', is_override: false, won: 0, refunded: 0, has_solo: false },
    ])
    await notifyMarketResult('m-1', db)
    expect(rpc).toHaveBeenCalledWith('push_market_result', { p_market_id: 'm-1' })
    expect(sendPush).toHaveBeenCalledWith(
      [
        { profileId: 'alice', payload: { title: 'DwellDuel', body: 'You won 26 DC on Will it rain?', url: '/markets/m-1' } },
        { profileId: 'bob', payload: { title: 'DwellDuel', body: 'Will it rain? resolved: No', url: '/markets/m-1' } },
      ],
      db,
    )
  })

  it('tells each submitter about their review', async () => {
    const { db, rpc } = dbReturning([
      { completion_id: 'c-1', profile_id: 'alice', task_title: 'Read Psalm 23', status: 'rejected', reward_amount: 10, review_note: 'No photo' },
    ])
    await notifyTaskReviews(['c-1'], db)
    expect(rpc).toHaveBeenCalledWith('push_task_reviews', { p_completion_ids: ['c-1'] })
    expect(sendPush.mock.calls[0][0]).toEqual([
      { profileId: 'alice', payload: { title: 'DwellDuel', body: 'Your task “Read Psalm 23” was rejected: No photo', url: '/tasks' } },
    ])
  })

  it('announces a new market to the members the database picks', async () => {
    const { db } = dbReturning([{ profile_id: 'bob', title: 'Sermon past noon?' }])
    await notifyNewMarket('m-2', db)
    expect(sendPush.mock.calls[0][0]).toEqual([
      { profileId: 'bob', payload: { title: 'DwellDuel', body: 'New market: Sermon past noon?', url: '/markets/m-2' } },
    ])
  })

  it('logs a failed recipient read and sends nothing', async () => {
    const { db } = dbReturning(null, new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await notifyMarketResult('m-1', db)).toBeNull()
    expect(sendPush).not.toHaveBeenCalled()
  })

  it("doesn't claim reminders it can't send", async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    const { db, rpc } = dbReturning([])
    expect(await sendResolveReminders(db)).toEqual({ reminded: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })
})
