import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  serviceRoleClient: () => ({ rpc: (fn: string, args?: unknown) => rpc(fn, args) }),
}))

import { GET } from '@/app/api/cron/closing-alerts/route'

const authorized = () => new Request('https://x/api/cron/closing-alerts', { headers: { authorization: 'Bearer s3cret' } })

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 's3cret')
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')
  vi.stubEnv('VAPID_PRIVATE_KEY', '')
  rpc.mockReset().mockResolvedValue({ data: [], error: null })
})

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
    expect(await res.json()).toEqual({ ok: true, reminded: 0, alerted: 0 })
    expect(rpc.mock.calls.map(([fn]) => fn)).toEqual(['record_cron_heartbeat'])
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
