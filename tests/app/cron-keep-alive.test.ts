import { describe, it, expect, vi, beforeEach } from 'vitest'

const profiles = vi.fn()
const rpc = vi.fn()
const settleSeason = vi.fn()
const remove = vi.fn()
const pruneKeys = vi.fn()
const deleteUser = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  serviceRoleClient: () => ({
    from: (table: string) =>
      table === 'idempotency_keys' ? { delete: () => ({ lt: pruneKeys }) } : { select: () => ({ limit: profiles }) },
    rpc: (fn: string, args?: unknown) => (fn === 'settle_season' ? settleSeason(args) : rpc(fn, args)),
    storage: { from: () => ({ remove }) },
    auth: { admin: { deleteUser } },
  }),
}))

import { GET } from '@/app/api/cron/keep-alive/route'

const authorized = () => new Request('https://x/api/cron/keep-alive', { headers: { authorization: 'Bearer s3cret' } })

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 's3cret')
  profiles.mockReset().mockResolvedValue({ error: null })
  rpc.mockReset().mockResolvedValue({ data: [], error: null })
  remove.mockReset().mockResolvedValue({ error: null })
  pruneKeys.mockReset().mockResolvedValue({ error: null })
  settleSeason.mockReset().mockResolvedValue({ data: null, error: null })
  deleteUser.mockReset().mockResolvedValue({ error: null })
})

describe('keep-alive cron', () => {
  it('refuses a request without the cron secret', async () => {
    const res = await GET(new Request('https://x/api/cron/keep-alive'))
    expect(res.status).toBe(401)
    expect(profiles).not.toHaveBeenCalled()
  })

  it('touches the database and removes stray proof files through the Storage API', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'stray_proof_objects'
        ? { data: [{ name: 'task/u/1/a.txt' }, { name: 'task/u/2/b.jpg' }], error: null }
        : { data: [], error: null },
    )
    const res = await GET(authorized())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, strayProofRemoved: 2, uninvitedUsersRemoved: 0, seasonChampion: null, resolveReminders: 0, marketAlerts: 0 })
    expect(rpc).toHaveBeenCalledWith('stray_proof_objects', { p_limit: 500 })
    expect(remove).toHaveBeenCalledWith(['task/u/1/a.txt', 'task/u/2/b.jpg'])
  })

  it('skips the Storage call when nothing is stray', async () => {
    const res = await GET(authorized())
    expect(await res.json()).toEqual({ ok: true, strayProofRemoved: 0, uninvitedUsersRemoved: 0, seasonChampion: null, resolveReminders: 0, marketAlerts: 0 })
    expect(remove).not.toHaveBeenCalled()
  })

  it('leaves the closing-alerts heartbeat alone, so a dead ten-minute schedule still shows', async () => {
    expect((await GET(authorized())).status).toBe(200)
    expect(rpc).not.toHaveBeenCalledWith('record_cron_heartbeat', expect.anything())
  })

  it('reports a failed cleanup as a 502, so the cron log shows it', async () => {
    rpc.mockResolvedValue({ data: [{ name: 'task/u/1/a.txt' }], error: null })
    remove.mockResolvedValue({ error: new Error('storage down') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(authorized())
    expect(res.status).toBe(502)
  })

  it('prunes attempt keys older than a day', async () => {
    const res = await GET(authorized())
    expect(res.status).toBe(200)
    const [column, cutoff] = pruneKeys.mock.calls[0]
    expect(column).toBe('created_at')
    expect(Date.now() - Date.parse(cutoff)).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000)
  })

  it('reports a failed key prune as a 502', async () => {
    pruneKeys.mockResolvedValue({ error: new Error('down') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await GET(authorized())).status).toBe(502)
  })

  it('deletes uninvited sign-ins through the Auth admin API, 50 a run (#275)', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'uninvited_auth_users' ? { data: [{ id: 'u1' }, { id: 'u2' }], error: null } : { data: [], error: null },
    )
    const res = await GET(authorized())
    expect(rpc).toHaveBeenCalledWith('uninvited_auth_users', { p_limit: 50 })
    expect(deleteUser.mock.calls).toEqual([['u1'], ['u2']])
    expect(await res.json()).toMatchObject({ ok: true, uninvitedUsersRemoved: 2 })
  })

  it('tries every uninvited sign-in when one delete fails, then reports the step as failed', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'uninvited_auth_users' ? { data: [{ id: 'u1' }, { id: 'u2' }], error: null } : { data: [], error: null },
    )
    deleteUser.mockResolvedValueOnce({ error: new Error('auth down') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(authorized())
    expect(deleteUser).toHaveBeenCalledTimes(2)
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ ok: false, failed: ['uninvited sign-in cleanup'] })
    expect(settleSeason).toHaveBeenCalled()
  })

  it("settles last month's season every run, with no month so the database picks it", async () => {
    settleSeason.mockResolvedValue({ data: 'champion-id', error: null })
    const res = await GET(authorized())
    expect(settleSeason).toHaveBeenCalledWith(undefined)
    expect(await res.json()).toMatchObject({ ok: true, seasonChampion: 'champion-id' })
  })

  it('reports a failed season settle as a 502', async () => {
    settleSeason.mockResolvedValue({ data: null, error: new Error('down') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await GET(authorized())).status).toBe(502)
  })

  it('runs every other step when the database touch fails, and names what failed', async () => {
    profiles.mockResolvedValue({ error: new Error('paused') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(authorized())
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ ok: false, failed: ['database'] })
    expect(settleSeason).toHaveBeenCalled()
    expect(pruneKeys).toHaveBeenCalled()
  })

  it('a proof-cleanup failure still prunes keys, settles the season and sends reminders (#259)', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'stray_proof_objects' ? { data: [{ name: 'bad/name' }], error: null } : { data: [], error: null },
    )
    remove.mockResolvedValue({ error: new Error('storage down') })
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(authorized())
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ ok: false, failed: ['proof cleanup'], seasonChampion: null })
    expect(pruneKeys).toHaveBeenCalled()
    expect(settleSeason).toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('due_resolve_reminders', undefined)
  })

  it('lists every step that failed, not just the first', async () => {
    pruneKeys.mockResolvedValue({ error: new Error('down') })
    settleSeason.mockResolvedValue({ data: null, error: new Error('down') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(authorized())
    expect((await res.json()).failed).toEqual(['key cleanup', 'season settle'])
  })

  it('pings the heartbeat on success and its /fail URL on failure', async () => {
    vi.stubEnv('HEALTHCHECKS_KEEP_ALIVE_URL', 'https://hc-ping.com/abc')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('OK'))
    await GET(authorized())
    expect(fetchSpy.mock.calls[0][0]).toBe('https://hc-ping.com/abc')
    pruneKeys.mockResolvedValue({ error: new Error('down') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await GET(authorized())
    expect(fetchSpy.mock.calls[1][0]).toBe('https://hc-ping.com/abc/fail')
    fetchSpy.mockRestore()
  })
})
