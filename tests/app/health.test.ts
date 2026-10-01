import { describe, it, expect, vi, beforeEach } from 'vitest'

const limit = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({ serviceRoleClient: () => ({ from: () => ({ select: () => ({ limit }) }) }) }))

import { GET } from '@/app/api/health/route'

beforeEach(() => {
  limit.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('/api/health', () => {
  it('answers 200, uncached and with no member data, when Supabase answers', async () => {
    limit.mockResolvedValue({ data: [{ id: 'secret' }], error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ ok: true })
  })

  it('answers 503 when the query errors or throws', async () => {
    limit.mockResolvedValue({ data: null, error: new Error('down') })
    expect((await GET()).status).toBe(503)
    limit.mockRejectedValue(new Error('aborted'))
    const res = await GET()
    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
