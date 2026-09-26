import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { AuthRetryableFetchError } from '@supabase/supabase-js'

type SetCookie = { name: string; value: string; options: Record<string, unknown> }
type ProxyClientOptions = { cookies: { setAll: (cookies: SetCookie[]) => void } }

const { getClaims, createServerClient } = vi.hoisted(() => {
  const getClaims = vi.fn()
  // Simulates @supabase/ssr refreshing the session during the auth call: every construction
  // hands the proxy a fresh cookie through its `setAll` option, the same way a refreshed
  // access/refresh token pair would arrive for real.
  const createServerClient = vi.fn((_url: string, _key: string, options: ProxyClientOptions) => {
    options.cookies.setAll([{ name: 'sb-refreshed', value: 'yes', options: {} }])
    return { auth: { getClaims } }
  })
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

  it('redirects a signed-out HEAD of an app path to /sign-in', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })

    const response = await proxy(request('/markets', { method: 'HEAD' }))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location')!).pathname).toBe('/sign-in')
  })

  it('copies refreshed cookies onto the 307 redirect', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })

    const response = await proxy(request('/markets'))

    expect(response.cookies.get('sb-refreshed')?.value).toBe('yes')
  })

  it('redirects a GET of an app path when claims verify but carry no sub', async () => {
    getClaims.mockResolvedValue({ data: { claims: {} }, error: null })

    const response = await proxy(request('/markets'))

    expect(response.status).toBe(307)
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

  it('keeps refreshed cookies on the pass-through when Auth is unavailable', async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError('network down', 0) })

    const response = await proxy(request('/markets'))

    expect(response.cookies.get('sb-refreshed')?.value).toBe('yes')
  })

  it('redirects to /sign-in when a malformed access-token cookie makes getClaims throw, on an app path', async () => {
    getClaims.mockRejectedValue(new SyntaxError('bad token'))

    const response = await proxy(request('/markets'))

    expect(response.status).toBe(307)
  })

  it('passes a malformed access-token cookie through with no redirect outside the app path', async () => {
    getClaims.mockRejectedValue(new SyntaxError('bad token'))

    const response = await proxy(request('/sign-in'))

    expect(response.status).not.toBe(307)
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
