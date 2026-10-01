import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'

const setCookie = vi.fn()
vi.mock('next/headers', () => ({ cookies: async () => ({ set: (...args: unknown[]) => setCookie(...args) }) }))

import { POST } from '@/app/(auth)/auth/google/nonce/route'

const request = (body: unknown, site: string | null = 'same-origin') =>
  new Request('https://www.dwellduel.com/auth/google/nonce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(site ? { 'Sec-Fetch-Site': site } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const cookie = (name: string) => setCookie.mock.calls.find(([n]) => n === name)

beforeEach(() => setCookie.mockReset())

describe('POST /auth/google/nonce', () => {
  it('keeps the raw nonce in an httpOnly cookie for /auth/google and hands the page only its SHA-256, as hex', async () => {
    const res = await POST(request({ next: null }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const { nonce } = await res.json()
    const [, raw, options] = cookie('google-nonce')!
    expect(options).toEqual({ path: '/auth/google', httpOnly: true, sameSite: 'none', secure: true, maxAge: 3600 })
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(nonce).toBe(createHash('sha256').update(raw).digest('hex'))
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

  it('refuses a request from another site', async () => {
    const res = await POST(request({}, 'cross-site'))
    expect(res.status).toBe(403)
    expect(setCookie).not.toHaveBeenCalled()
  })
})
