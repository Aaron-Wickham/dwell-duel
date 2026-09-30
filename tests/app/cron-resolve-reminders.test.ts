import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { rpc, sendPush } = vi.hoisted(() => ({ rpc: vi.fn(), sendPush: vi.fn() }))
vi.mock('@/lib/push/send', () => ({ sendPush }))
vi.mock('@/lib/supabase/service-role', () => ({
  serviceRoleClient: () => ({
    from: () => ({
      select: () => ({ limit: async () => ({ error: null }) }),
      delete: () => ({ lt: async () => ({ error: null }) }),
    }),
    rpc,
    storage: { from: () => ({ remove: vi.fn() }) },
  }),
}))

import { GET } from '@/app/api/cron/keep-alive/route'

const authorized = () => new Request('https://x/api/cron/keep-alive', { headers: { authorization: 'Bearer s3cret' } })

let reminders: { data: unknown; error: unknown }

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 's3cret')
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
  reminders = { data: [], error: null }
  rpc.mockReset().mockImplementation(async (fn: string) =>
    fn === 'due_resolve_reminders' ? reminders : { data: fn === 'settle_season' ? null : fn === 'claim_push_log' ? 1 : [], error: null },
  )
  sendPush.mockReset().mockResolvedValue({ sent: 1, removed: 0, failed: 0 })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('keep-alive cron: resolve reminders', () => {
  it('asks each creator to resolve the markets that are due, market by market, then claims them', async () => {
    reminders = {
      data: [
        { market_id: 'm-1', title: 'Will it rain?', profile_id: 'alice' },
        { market_id: 'm-2', title: 'Sermon past noon?', profile_id: 'bob' },
      ],
      error: null,
    }
    const res = await GET(authorized())

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, resolveReminders: 2 })
    expect(rpc).toHaveBeenCalledWith('due_resolve_reminders')
    expect(sendPush.mock.calls.map(([messages]) => messages)).toEqual([
      [{ profileId: 'alice', payload: { title: 'Time to resolve', body: 'Will it rain? has closed', url: '/markets/m-1' } }],
      [{ profileId: 'bob', payload: { title: 'Time to resolve', body: 'Sermon past noon? has closed', url: '/markets/m-2' } }],
    ])
    expect(rpc).toHaveBeenCalledWith('claim_push_log', { p_kind: 'resolve_reminder', p_refs: ['m-1', 'm-2'] })
  })

  it('claims nothing when push isn’t set up, so no reminder is lost', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    const res = await GET(authorized())
    expect(await res.json()).toMatchObject({ ok: true, resolveReminders: 0 })
    expect(rpc).not.toHaveBeenCalledWith('due_resolve_reminders')
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('reports a failed reminder read as a 502', async () => {
    reminders = { data: null, error: new Error('down') }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await GET(authorized())).status).toBe(502)
    expect(sendPush).not.toHaveBeenCalled()
  })
})
