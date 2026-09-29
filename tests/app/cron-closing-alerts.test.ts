import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  serviceRoleClient: () => ({ rpc: (fn: string) => rpc(fn) }),
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
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reports a failed read as a 502 rather than a quiet success', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValue({ data: null, error: new Error('db down') })
    expect((await GET(authorized())).status).toBe(502)
  })
})
