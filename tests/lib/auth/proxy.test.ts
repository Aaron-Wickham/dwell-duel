import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { AuthRetryableFetchError } from '@supabase/supabase-js'

const { getClaims, createServerClient } = vi.hoisted(() => {
  const getClaims = vi.fn()
  const createServerClient = vi.fn(() => ({ auth: { getClaims } }))
  return { getClaims, createServerClient }
})
vi.mock('@supabase/ssr', () => ({ createServerClient }))

import { proxy } from '@/proxy'

function request(pathname: string, init?: { method?: string }) {
  return new NextRequest(new URL(pathname, 'https://dwellduel.example'), init)
}

beforeEach(() => {
  getClaims.mockReset()
  createServerClient.mockClear()
})

describe('proxy', () => {
  it('redirects a signed-out GET of an app path to /sign-in', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })

    const response = await proxy(request('/markets'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location')!).pathname).toBe('/sign-in')
  })

  it('does not redirect a signed-in GET of an app path', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'member-1' } }, error: null })

    const response = await proxy(request('/markets'))

    expect(response.status).not.toBe(307)
  })

  it('passes the request through with no redirect when Auth is unavailable, even under an app path', async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError('network down', 0) })

    const response = await proxy(request('/markets'))

    expect(response.status).not.toBe(307)
    expect(response.headers.get('location')).toBeNull()
  })

  it('does not redirect a signed-out server action POST', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })

    const response = await proxy(request('/markets', { method: 'POST' }))

    expect(response.status).not.toBe(307)
  })

  it('does not redirect a path outside the app sections', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })

    const response = await proxy(request('/sign-in'))

    expect(response.status).not.toBe(307)
  })
})
