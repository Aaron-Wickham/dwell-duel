import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpc, sendPush } = vi.hoisted(() => ({ rpc: vi.fn(), sendPush: vi.fn() }))
vi.mock('@/lib/supabase/service-role', () => ({
  serviceRoleClient: () => ({ rpc: (fn: string, args?: unknown) => rpc(fn, args) }),
}))
vi.mock('@/lib/push/send', () => ({ sendPush }))

import { GET } from '@/app/api/cron/closing-alerts/route'

const authorized = () => new Request('https://x/api/cron/closing-alerts', { headers: { authorization: 'Bearer s3cret' } })

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 's3cret')
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')
  vi.stubEnv('VAPID_PRIVATE_KEY', '')
  rpc.mockReset().mockResolvedValue({ data: [], error: null })
  sendPush.mockReset().mockResolvedValue({ sent: 1, removed: 0, failed: 0 })
})

const due = (rows: unknown[]) =>
  rpc.mockImplementation(async (fn: string) =>
    fn === 'due_resolve_reminders' ? { data: rows, error: null } : { data: fn === 'claim_push_log' ? rows.length : [], error: null },
  )

describe('closing-alerts cron', () => {
  it('refuses a request without the cron secret, and one when no secret is configured', async () => {
    expect((await GET(new Request('https://x/api/cron/closing-alerts'))).status).toBe(401)
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(new Request('https://x/api/cron/closing-alerts', { headers: { authorization: 'Bearer ' } }))).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('claims nothing without push keys, so nothing is lost before they are set', async () => {
    const res = await GET(authorized())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, reminded: 0, alerted: 0, sent: 0, failed: 0 })
    expect(rpc.mock.calls.map(([fn]) => fn)).toEqual(['record_cron_heartbeat'])
  })

  // #207: a market is claimed once a device took its push. #257: failed pushes don't touch the
  // heartbeat, which only says whether the schedule ran.
  it('claims a market after its push is delivered, then stamps the heartbeat', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    due([{ market_id: 'm-1', title: 'Will it rain?', profile_id: 'alice' }])
    const res = await GET(authorized())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, reminded: 1, alerted: 0, sent: 1, failed: 0 })
    expect(rpc.mock.calls.map(([fn]) => fn)).toEqual(['due_resolve_reminders', 'claim_push_log', 'due_market_alerts', 'record_cron_heartbeat'])
    expect(rpc).toHaveBeenCalledWith('claim_push_log', { p_kind: 'resolve_reminder', p_refs: ['m-1'] })
  })

  it('claims nothing but still stamps the heartbeat when every push failed, so one broken device is no alarm (#257)', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    due([{ market_id: 'm-1', title: 'Will it rain?', profile_id: 'alice' }])
    sendPush.mockResolvedValue({ sent: 0, removed: 0, failed: 1 })
    const res = await GET(authorized())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ sent: 0, failed: 1 })
    expect(rpc).not.toHaveBeenCalledWith('claim_push_log', expect.anything())
    expect(rpc).toHaveBeenCalledWith('record_cron_heartbeat', { p_name: 'closing-alerts' })
  })

  it('still stamps the heartbeat when some devices failed but others were reached', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    due([{ market_id: 'm-1', title: 'Will it rain?', profile_id: 'alice' }])
    sendPush.mockResolvedValue({ sent: 1, removed: 0, failed: 1 })
    expect((await GET(authorized())).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('record_cron_heartbeat', { p_name: 'closing-alerts' })
  })

  it('records the run after sending, for the Admin pages’ warning', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    expect((await GET(authorized())).status).toBe(200)
    expect(rpc.mock.calls.at(-1)).toEqual(['record_cron_heartbeat', { p_name: 'closing-alerts' }])
  })

  it('reports a failed heartbeat as a 502, so the workflow run fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockImplementation(async (fn: string) =>
      fn === 'record_cron_heartbeat' ? { data: null, error: new Error('db down') } : { data: [], error: null },
    )
    expect((await GET(authorized())).status).toBe(502)
  })

  it('reports a failed read as a 502 rather than a quiet success', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValue({ data: null, error: new Error('db down') })
    expect((await GET(authorized())).status).toBe(502)
    expect(rpc).not.toHaveBeenCalledWith('record_cron_heartbeat', expect.anything())
  })
})
