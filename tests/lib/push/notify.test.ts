import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { sendPush, after } = vi.hoisted(() => ({ sendPush: vi.fn(), after: vi.fn() }))
vi.mock('@/lib/push/send', () => ({ sendPush }))
vi.mock('@/lib/supabase/service-role', () => ({ serviceRoleClient: vi.fn() }))
vi.mock('next/server', () => ({ after }))

import {
  afterAction,
  notifyMarketResult,
  NEW_MARKET_PAGE,
  notifyNewMarket,
  notifyTaskReviews,
  notifyTaskSubmitted,
  sendClosingAlerts,
  sendMarketAlerts,
  sendResolveReminders,
} from '@/lib/push/notify'
import type { DbClient } from '@/lib/supabase/database'

const dbReturning = (data: unknown, error: unknown = null) => {
  const rpc = vi.fn(async () => ({ data, error }))
  return { db: { rpc } as unknown as DbClient, rpc }
}

beforeEach(() => {
  sendPush.mockReset().mockResolvedValue({ sent: 1, removed: 0, failed: 0, systemic: 0, credentials: 0 })
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
        { profileId: 'alice', payload: { title: 'You won 26 DC', body: 'Will it rain?: No', url: '/markets/m-1' } },
        { profileId: 'bob', payload: { title: 'Market resolved', body: 'Will it rain?: No', url: '/markets/m-1' } },
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
      { profileId: 'alice', payload: { title: 'Task not approved', body: 'Read Psalm 23: No photo', url: '/tasks' } },
    ])
  })

  // push_new_market's rows, read the way PostgREST would serve them: ordered by profile_id, after
  // a .gt() bound when given, at most .limit() rows a request.
  function pagedRecipients(rows: { profile_id: string; title: string }[], error: unknown = null, failOnRequest = 0) {
    const requests: { after: string | null; limit: number }[] = []
    const rpc = vi.fn(() => {
      let after: string | null = null
      const query = {
        select: () => query,
        gt: (_col: string, value: string) => {
          after = value
          return query
        },
        order: () => query,
        limit: async (limit: number) => {
          requests.push({ after, limit })
          if (error && requests.length > failOnRequest) return { data: null, error }
          const sorted = [...rows].sort((a, b) => a.profile_id.localeCompare(b.profile_id))
          return { data: sorted.filter((r) => after === null || r.profile_id > after).slice(0, limit), error: null }
        },
      }
      return query
    })
    return { db: { rpc } as unknown as DbClient, rpc, requests }
  }

  it('announces a new market to the members the database picks', async () => {
    const { db, rpc } = pagedRecipients([{ profile_id: 'bob', title: 'Sermon past noon?' }])
    await notifyNewMarket('m-2', db)
    expect(rpc).toHaveBeenCalledWith('push_new_market', { p_market_id: 'm-2' })
    expect(sendPush.mock.calls[0][0]).toEqual([
      { profileId: 'bob', payload: { title: 'New market', body: 'Sermon past noon?', url: '/markets/m-2' } },
    ])
  })

  // #254: PostgREST serves 1000 rows a request, so the recipients past the first 1000 are read on.
  it('reads every recipient past the 1000-row cap, a page at a time', async () => {
    const rows = Array.from({ length: NEW_MARKET_PAGE * 2 + 5 }, (_, i) => ({ profile_id: `p-${String(i).padStart(5, '0')}`, title: 'Big market' }))
    const { db, requests } = pagedRecipients(rows)
    await notifyNewMarket('m-3', db)
    expect(requests).toEqual([
      { after: null, limit: NEW_MARKET_PAGE },
      { after: 'p-00999', limit: NEW_MARKET_PAGE },
      { after: 'p-01999', limit: NEW_MARKET_PAGE },
    ])
    const sent = sendPush.mock.calls[0][0] as { profileId: string }[]
    expect(sent).toHaveLength(rows.length)
    expect(new Set(sent.map((m) => m.profileId)).size).toBe(rows.length)
  })

  it('still sends to the recipients already read when a later page fails, and logs it', async () => {
    const rows = Array.from({ length: NEW_MARKET_PAGE + 5 }, (_, i) => ({ profile_id: `p-${String(i).padStart(5, '0')}`, title: 'Big market' }))
    const { db, requests } = pagedRecipients(rows, new Error('timeout'), 1)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await notifyNewMarket('m-5', db)
    expect(requests).toHaveLength(2)
    expect(sendPush.mock.calls[0][0]).toHaveLength(NEW_MARKET_PAGE)
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`after ${NEW_MARKET_PAGE} of them`), expect.any(Error))
  })

  it('sends nothing when the first page of recipients fails to read', async () => {
    const { db } = pagedRecipients([], new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await notifyNewMarket('m-4', db)).toBeNull()
    expect(sendPush).not.toHaveBeenCalled()
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
    expect(await sendResolveReminders(db)).toEqual({ reminded: 0, sent: 0, failed: 0, systemic: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })

  // #207: the claim follows the delivery, one market at a time.
  it('reads the due reminders, sends each market’s on its own, and claims only the markets a device took', async () => {
    const rpc = vi.fn(async (fn: string) =>
      fn === 'due_resolve_reminders'
        ? {
            data: [
              { market_id: 'm-1', title: 'A', profile_id: 'alice' },
              { market_id: 'm-2', title: 'B', profile_id: 'bob' },
              { market_id: 'm-3', title: 'C', profile_id: 'carol' },
            ],
            error: null,
          }
        : { data: 2, error: null },
    )
    const db = { rpc } as unknown as DbClient
    sendPush
      .mockResolvedValueOnce({ sent: 1, removed: 0, failed: 0, systemic: 0, credentials: 0 })
      .mockResolvedValueOnce({ sent: 0, removed: 0, failed: 2, systemic: 0, credentials: 0 })
      .mockResolvedValueOnce({ sent: 2, removed: 1, failed: 0, systemic: 0, credentials: 0 })

    expect(await sendResolveReminders(db)).toEqual({ reminded: 2, sent: 3, failed: 2, systemic: 0 })
    expect(sendPush.mock.calls.map(([messages]) => messages.map((m: { profileId: string }) => m.profileId))).toEqual([['alice'], ['bob'], ['carol']])
    expect(rpc).toHaveBeenCalledWith('claim_push_log', { p_kind: 'resolve_reminder', p_refs: ['m-1', 'm-3'] })
  })

  it('claims nothing when every send failed, so the market is due again next run', async () => {
    const rpc = vi.fn(async () => ({ data: [{ market_id: 'm-1', title: 'A', profile_id: 'alice' }], error: null }))
    sendPush.mockResolvedValue({ sent: 0, removed: 0, failed: 1, systemic: 0, credentials: 0 })
    expect(await sendResolveReminders({ rpc } as unknown as DbClient)).toEqual({ reminded: 0, sent: 0, failed: 1, systemic: 0 })
    expect(rpc).not.toHaveBeenCalledWith('claim_push_log', expect.anything())
    // The database counts the try, and gives up on the market after 24 hours (0076).
    expect(rpc).toHaveBeenCalledWith('record_push_failures', { p_kind: 'resolve_reminder', p_refs: ['m-1'] })
  })

  it('does not count a systemic failure toward giving up on a market', async () => {
    const rpc = vi.fn(async () => ({ data: [{ market_id: 'm-1', title: 'A', profile_id: 'alice' }], error: null }))
    sendPush.mockResolvedValue({ sent: 0, removed: 0, failed: 1, systemic: 1, credentials: 0 })
    expect(await sendResolveReminders({ rpc } as unknown as DbClient)).toEqual({ reminded: 0, sent: 0, failed: 1, systemic: 1 })
    expect(rpc).not.toHaveBeenCalledWith('record_push_failures', expect.anything())
  })

  it('reports a failed claim, since the next run would otherwise repeat a push it can’t remember', async () => {
    const failure = new Error('db down')
    const rpc = vi.fn(async (fn: string) =>
      fn === 'due_resolve_reminders' ? { data: [{ market_id: 'm-1', title: 'A', profile_id: 'alice' }], error: null } : { data: null, error: failure },
    )
    expect(await sendResolveReminders({ rpc } as unknown as DbClient)).toEqual({ error: failure })
  })

  it('tells the reviewers the database picks about a new submission', async () => {
    const { db, rpc } = dbReturning([{ profile_id: 'rae', task_title: 'Read Psalm 23', submitter_name: 'Grace' }])
    await notifyTaskSubmitted('c-1', db)
    expect(rpc).toHaveBeenCalledWith('push_task_alerts', { p_completion_id: 'c-1' })
    expect(sendPush.mock.calls[0][0]).toEqual([
      { profileId: 'rae', payload: { title: 'Task to review', body: 'Grace: Read Psalm 23', url: '/admin/tasks' } },
    ])
  })

  it('logs a failed task alert read and sends nothing', async () => {
    const { db } = dbReturning(null, new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await notifyTaskSubmitted('c-1', db)).toBeNull()
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('alerts each admin once per market, sending a market’s admins together and counting markets not recipients', async () => {
    const rpc = vi.fn(async (fn: string) =>
      fn === 'due_market_alerts'
        ? {
            data: [
              { market_id: 'm-1', title: 'Will it rain?', profile_id: 'ada' },
              { market_id: 'm-1', title: 'Will it rain?', profile_id: 'olive' },
            ],
            error: null,
          }
        : { data: 1, error: null },
    )
    const db = { rpc } as unknown as DbClient
    sendPush.mockResolvedValue({ sent: 2, removed: 0, failed: 0, systemic: 0, credentials: 0 })
    expect(await sendMarketAlerts(db)).toEqual({ alerted: 1, sent: 2, failed: 0, systemic: 0 })
    expect(rpc).toHaveBeenCalledWith('due_market_alerts')
    expect(sendPush).toHaveBeenCalledTimes(1)
    expect(sendPush.mock.calls[0][0]).toHaveLength(2)
    expect(rpc).toHaveBeenCalledWith('claim_push_log', { p_kind: 'market_alert', p_refs: ['m-1'] })
  })

  it("doesn't claim market alerts it can't send", async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    const { db, rpc } = dbReturning([])
    expect(await sendMarketAlerts(db)).toEqual({ alerted: 0, sent: 0, failed: 0, systemic: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reports a failed alert read to the caller', async () => {
    const failure = new Error('db down')
    const { db } = dbReturning(null, failure)
    expect(await sendMarketAlerts(db)).toEqual({ error: failure })
  })

  it('runs the creator reminders and the admin alerts together, adding up what the devices took', async () => {
    const rpc = vi.fn(async (fn: string) =>
      fn === 'due_resolve_reminders'
        ? { data: [{ market_id: 'm-1', title: 'A', profile_id: 'alice' }], error: null }
        : fn === 'due_market_alerts'
          ? { data: [{ market_id: 'm-2', title: 'B', profile_id: 'ada' }], error: null }
          : { data: 1, error: null },
    )
    sendPush.mockResolvedValueOnce({ sent: 1, removed: 0, failed: 1, systemic: 0, credentials: 0 }).mockResolvedValueOnce({ sent: 2, removed: 0, failed: 0, systemic: 0, credentials: 0 })
    expect(await sendClosingAlerts({ rpc } as unknown as DbClient)).toEqual({ reminded: 1, alerted: 1, sent: 3, failed: 1, systemic: 0 })
  })

  // A 403 device and a 400 device on one market, in a run that delivered nothing: the 400 is the
  // device's own, so the market counts toward giving up; the 403 stays systemic.
  it('counts a market with a device-caused failure toward giving up, even beside a 401/403', async () => {
    const rpc = vi.fn(async (fn: string) =>
      fn === 'claim_cron_lease'
        ? { data: true, error: null }
        : fn === 'due_resolve_reminders'
          ? { data: [{ market_id: 'm-1', title: 'A', profile_id: 'alice' }], error: null }
          : { data: [], error: null },
    )
    sendPush.mockImplementationOnce(async (_messages: unknown, _db: unknown, run: { credentialIds: string[]; credentialCount: number }) => {
      run.credentialIds.push('s-403')
      run.credentialCount += 1
      return { sent: 0, removed: 0, failed: 2, systemic: 0, credentials: 1 }
    })
    expect(await sendClosingAlerts({ rpc } as unknown as DbClient)).toEqual({ reminded: 0, alerted: 0, sent: 0, failed: 2, systemic: 1 })
    expect(rpc).toHaveBeenCalledWith('record_push_failures', { p_kind: 'resolve_reminder', p_refs: ['m-1'] })
    expect(rpc).not.toHaveBeenCalledWith('record_push_results', expect.anything())
  })

  it('settles the 401/403 answers it collected even when a later step fails, and still reports the error', async () => {
    const failure = new Error('db down')
    const rpc = vi.fn(async (fn: string) =>
      fn === 'claim_cron_lease'
        ? { data: true, error: null }
        : fn === 'due_resolve_reminders'
          ? { data: [{ market_id: 'm-1', title: 'A', profile_id: 'alice' }, { market_id: 'm-2', title: 'B', profile_id: 'bob' }], error: null }
          : fn === 'due_market_alerts'
            ? { data: null, error: failure }
            : { data: 1, error: null },
    )
    sendPush
      .mockImplementationOnce(async (_messages: unknown, _db: unknown, run: { sent: number }) => {
        run.sent += 1
        return { sent: 1, removed: 0, failed: 0, systemic: 0, credentials: 0 }
      })
      .mockImplementationOnce(async (_messages: unknown, _db: unknown, run: { credentialIds: string[]; credentialCount: number }) => {
        run.credentialIds.push('s-403')
        run.credentialCount += 1
        return { sent: 0, removed: 0, failed: 1, systemic: 0, credentials: 1 }
      })
    expect(await sendClosingAlerts({ rpc } as unknown as DbClient)).toEqual({ error: failure })
    expect(rpc).toHaveBeenCalledWith('record_push_results', { p_delivered: [], p_failed: ['s-403'] })
    expect(rpc).toHaveBeenCalledWith('record_push_failures', { p_kind: 'resolve_reminder', p_refs: ['m-2'] })
    expect(rpc).toHaveBeenLastCalledWith('release_cron_lease', { p_name: 'closing-alerts' })
  })

  it('skips the whole run while another holds the lease, and releases it afterwards', async () => {
    const busy = vi.fn(async () => ({ data: false, error: null }))
    expect(await sendClosingAlerts({ rpc: busy } as unknown as DbClient)).toEqual({ reminded: 0, alerted: 0, sent: 0, failed: 0, systemic: 0, busy: true })
    expect(busy).toHaveBeenCalledTimes(1)

    const rpc = vi.fn(async (): Promise<{ data: unknown; error: null }> => ({ data: [], error: null }))
    rpc.mockImplementationOnce(async () => ({ data: true, error: null }))
    await sendClosingAlerts({ rpc } as unknown as DbClient)
    expect(rpc).toHaveBeenLastCalledWith('release_cron_lease', { p_name: 'closing-alerts' })
  })
})
