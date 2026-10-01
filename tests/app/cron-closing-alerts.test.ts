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
  rpc.mockReset().mockImplementation(async (fn: string) => ({ data: fn === 'claim_cron_lease' ? true : [], error: null }))
  sendPush.mockReset().mockResolvedValue({ sent: 1, removed: 0, failed: 0, systemic: 0, credentials: 0 })
})

const due = (rows: unknown[]) =>
  rpc.mockImplementation(async (fn: string) =>
    fn === 'due_resolve_reminders'
      ? { data: rows, error: null }
      : { data: fn === 'claim_push_log' ? rows.length : fn === 'claim_cron_lease' ? true : [], error: null },
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
    expect(await res.json()).toEqual({ ok: true, reminded: 0, alerted: 0, sent: 0, failed: 0, systemic: 0 })
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
    expect(await res.json()).toEqual({ ok: true, reminded: 1, alerted: 0, sent: 1, failed: 0, systemic: 0 })
    expect(rpc.mock.calls.map(([fn]) => fn)).toEqual(['claim_cron_lease', 'due_resolve_reminders', 'claim_push_log', 'due_market_alerts', 'release_cron_lease', 'record_cron_heartbeat'])
    expect(rpc).toHaveBeenCalledWith('claim_push_log', { p_kind: 'resolve_reminder', p_refs: ['m-1'] })
  })

  it('claims nothing but still stamps the heartbeat when one or two pushes failed, so a broken device is no alarm (#257)', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    due([{ market_id: 'm-1', title: 'Will it rain?', profile_id: 'alice' }])
    sendPush.mockResolvedValue({ sent: 0, removed: 0, failed: 1, systemic: 0, credentials: 0 })
    const res = await GET(authorized())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ sent: 0, failed: 1, systemic: 0 })
    expect(rpc).not.toHaveBeenCalledWith('claim_push_log', expect.anything())
    expect(rpc).toHaveBeenCalledWith('record_cron_heartbeat', { p_name: 'closing-alerts' })
  })

  // #257: a one-device group with a systemic failure (VAPID 403, network, 5xx) must alarm, however few
  // devices there are.
  it('fails the run and skips the heartbeat when nothing was delivered and a failure was systemic, even for one device', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    due([{ market_id: 'm-1', title: 'Will it rain?', profile_id: 'alice' }])
    sendPush.mockResolvedValue({ sent: 0, removed: 0, failed: 1, systemic: 1, credentials: 0 })
    expect((await GET(authorized())).status).toBe(502)
    expect(rpc).not.toHaveBeenCalledWith('record_cron_heartbeat', expect.anything())
    expect(rpc).not.toHaveBeenCalledWith('record_push_failures', expect.anything())
    expect(rpc).toHaveBeenCalledWith('release_cron_lease', expect.anything())
  })

  it('raises no alarm for three devices the push service rejected (400/413-type), which only count against them', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    due([{ market_id: 'm-1', title: 'Will it rain?', profile_id: 'alice' }])
    sendPush.mockResolvedValue({ sent: 0, removed: 0, failed: 3, systemic: 0, credentials: 0 })
    expect((await GET(authorized())).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('record_push_failures', { p_kind: 'resolve_reminder', p_refs: ['m-1'] })
    expect(rpc).toHaveBeenCalledWith('record_cron_heartbeat', { p_name: 'closing-alerts' })
  })

  // #257: a 403 is the device's (an older VAPID key) when the run delivered something, ours when it didn't.
  const credentialAnswer = (ids: Record<string, string>) =>
    sendPush.mockImplementation(async (messages: { profileId: string }[], _db: unknown, run: { sent: number; credentialIds: string[]; credentialCount: number }) => {
      const id = ids[messages[0].profileId]
      if (!id) {
        run.sent += 1
        return { sent: 1, removed: 0, failed: 0, systemic: 0, credentials: 0 }
      }
      run.credentialIds.push(id)
      run.credentialCount++
      return { sent: 0, removed: 0, failed: 1, systemic: 0, credentials: 1 }
    })

  it('records a 403 against its device, and stamps the heartbeat, when another device was delivered to', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    due([
      { market_id: 'm-1', title: 'A', profile_id: 'alice' },
      { market_id: 'm-2', title: 'B', profile_id: 'bob' },
    ])
    credentialAnswer({ alice: 'sub-alice' })
    const res = await GET(authorized())
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('record_push_results', { p_delivered: [], p_failed: ['sub-alice'] })
    expect(rpc).toHaveBeenCalledWith('record_push_failures', { p_kind: 'resolve_reminder', p_refs: ['m-1'] })
    expect(rpc).toHaveBeenCalledWith('record_cron_heartbeat', { p_name: 'closing-alerts' })
  })

  it('treats a lone 403 as our credentials: 502, no heartbeat, nothing recorded against the device', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    due([{ market_id: 'm-1', title: 'A', profile_id: 'alice' }])
    credentialAnswer({ alice: 'sub-alice' })
    expect((await GET(authorized())).status).toBe(502)
    expect(rpc).not.toHaveBeenCalledWith('record_push_results', expect.anything())
    expect(rpc).not.toHaveBeenCalledWith('record_push_failures', expect.anything())
    expect(rpc).not.toHaveBeenCalledWith('record_cron_heartbeat', expect.anything())
  })

  it('still stamps the heartbeat when a systemic failure came alongside a delivery', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    due([{ market_id: 'm-1', title: 'Will it rain?', profile_id: 'alice' }])
    sendPush.mockResolvedValue({ sent: 1, removed: 0, failed: 1, systemic: 1, credentials: 0 })
    expect((await GET(authorized())).status).toBe(200)
  })

  it('does nothing while another run holds the lease, so two callers never send the same alert', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    rpc.mockImplementation(async (fn: string) => ({ data: fn === 'claim_cron_lease' ? false : [], error: null }))
    const res = await GET(authorized())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ busy: true, sent: 0 })
    expect(rpc.mock.calls.map(([fn]) => fn)).toEqual(['claim_cron_lease'])
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('still stamps the heartbeat when some devices failed but others were reached', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    due([{ market_id: 'm-1', title: 'Will it rain?', profile_id: 'alice' }])
    sendPush.mockResolvedValue({ sent: 1, removed: 0, failed: 1, systemic: 0, credentials: 0 })
    expect((await GET(authorized())).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('record_cron_heartbeat', { p_name: 'closing-alerts' })
  })

  it('pings the optional healthchecks URL on a healthy run and its /fail on a 502 (#256)', async () => {
    vi.stubEnv('HEALTHCHECKS_CLOSING_ALERTS_URL', 'https://hc-ping.com/closing')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('OK'))
    expect((await GET(authorized())).status).toBe(200)
    expect(fetchSpy.mock.calls[0][0]).toBe('https://hc-ping.com/closing')
    rpc.mockResolvedValue({ data: null, error: new Error('down') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await GET(authorized())).status).toBe(502)
    expect(fetchSpy.mock.calls[1][0]).toBe('https://hc-ping.com/closing/fail')
    fetchSpy.mockRestore()
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
