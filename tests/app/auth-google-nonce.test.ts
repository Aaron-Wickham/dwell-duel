import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'

const setCookie = vi.fn()
vi.mock('next/headers', () => ({ cookies: async () => ({ set: (...args: unknown[]) => setCookie(...args) }) }))

import { POST } from '@/app/(auth)/auth/google/nonce/route'

const request = (body: unknown, site: string | null = 'same-origin', origin = 'https://www.dwellduel.com') =>
  new Request(`${origin}/auth/google/nonce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(site ? { 'Sec-Fetch-Site': site } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const cookie = (name: string) => setCookie.mock.calls.find(([n]) => n === name)

beforeEach(() => {
  setCookie.mockReset()
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'client-123.apps.googleusercontent.com')
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /auth/google/nonce', () => {
  it('keeps the raw nonce in an httpOnly cookie for /auth/google and sends Google only its SHA-256, as hex', async () => {
    const res = await POST(request({ next: null }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const url = new URL((await res.json()).url)
    const [, raw, options] = cookie('google-nonce')!
    expect(options).toEqual({ path: '/auth/google', httpOnly: true, sameSite: 'none', secure: true, maxAge: 3600 })
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(url.searchParams.get('nonce')).toBe(createHash('sha256').update(raw).digest('hex'))
  })

  it('sends the member to Google, posting the ID token back to /auth/google with the state in a cookie', async () => {
    const url = new URL((await (await POST(request({}))).json()).url)
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'client-123.apps.googleusercontent.com',
      redirect_uri: 'https://www.dwellduel.com/auth/google',
      response_type: 'id_token',
      response_mode: 'form_post',
      scope: 'openid email profile',
      prompt: 'select_account',
    })
    const [, state, options] = cookie('google-state')!
    expect(options).toEqual({ path: '/auth/google', httpOnly: true, sameSite: 'none', secure: true, maxAge: 3600 })
    expect(url.searchParams.get('state')).toBe(state)
    expect(state).not.toBe(cookie('google-nonce')![1])
  })

  it('is not found without a Google client ID', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '')
    const res = await POST(request({}))
    expect(res.status).toBe(404)
    expect(setCookie).not.toHaveBeenCalled()
  })

  it('makes a new nonce every time', async () => {
    await POST(request({}))
    await POST(request({}))
    const raws = setCookie.mock.calls.filter(([n]) => n === 'google-nonce').map(([, v]) => v)
    expect(new Set(raws).size).toBe(2)
  })

  it('remembers a safe next for /auth/google, and clears an unsafe or missing one', async () => {
    await POST(request({ next: '/markets/abc?from=share' }))
    expect(cookie('sign-in-next')).toEqual([
      'sign-in-next',
      '/markets/abc?from=share',
      { path: '/auth/google', httpOnly: true, sameSite: 'none', secure: true, maxAge: 3600 },
    ])

    setCookie.mockReset()
    await POST(request({ next: '//evil.example' }))
    expect(cookie('sign-in-next')?.[1]).toBe('')
    expect(cookie('sign-in-next')?.[2]).toMatchObject({ maxAge: 0 })

    setCookie.mockReset()
    await POST(request(undefined))
    expect(cookie('sign-in-next')?.[2]).toMatchObject({ maxAge: 0 })
  })

  it('drops Secure (and so SameSite=None) on plain http, so local dev keeps its cookies', async () => {
    await POST(request({}, 'same-origin', 'http://localhost:3000'))
    expect(cookie('google-nonce')?.[2]).toEqual({ path: '/auth/google', httpOnly: true, sameSite: 'lax', secure: false, maxAge: 3600 })
  })

  it('refuses a request from another site', async () => {
    const res = await POST(request({}, 'cross-site'))
    expect(res.status).toBe(403)
    expect(setCookie).not.toHaveBeenCalled()
  })
})
