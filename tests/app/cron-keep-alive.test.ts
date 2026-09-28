import { describe, it, expect, vi, beforeEach } from 'vitest'

const profiles = vi.fn()
const rpc = vi.fn()
const remove = vi.fn()
const pruneKeys = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  serviceRoleClient: () => ({
    from: (table: string) =>
      table === 'idempotency_keys' ? { delete: () => ({ lt: pruneKeys }) } : { select: () => ({ limit: profiles }) },
    rpc,
    storage: { from: () => ({ remove }) },
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
})

describe('keep-alive cron', () => {
  it('refuses a request without the cron secret', async () => {
    const res = await GET(new Request('https://x/api/cron/keep-alive'))
    expect(res.status).toBe(401)
    expect(profiles).not.toHaveBeenCalled()
  })

  it('touches the database and removes stray proof files through the Storage API', async () => {
    rpc.mockResolvedValue({ data: [{ name: 'task/u/1/a.txt' }, { name: 'task/u/2/b.jpg' }], error: null })
    const res = await GET(authorized())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, strayProofRemoved: 2 })
    expect(rpc).toHaveBeenCalledWith('stray_proof_objects', { p_limit: 500 })
    expect(remove).toHaveBeenCalledWith(['task/u/1/a.txt', 'task/u/2/b.jpg'])
  })

  it('skips the Storage call when nothing is stray', async () => {
    const res = await GET(authorized())
    expect(await res.json()).toEqual({ ok: true, strayProofRemoved: 0 })
    expect(remove).not.toHaveBeenCalled()
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

  it('still reports a database failure first', async () => {
    profiles.mockResolvedValue({ error: new Error('paused') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await GET(authorized())).status).toBe(502)
    expect(rpc).not.toHaveBeenCalled()
  })
})
