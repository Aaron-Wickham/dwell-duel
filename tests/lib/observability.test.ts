import { describe, it, expect, vi } from 'vitest'
import { scrubEvent } from '@/lib/observability/scrub'
import { pingHeartbeat } from '@/lib/observability/heartbeat'
import { isDeliberateRaise } from '@/lib/errors/deliberate-raise'

describe('scrubEvent', () => {
  it('drops the user, cookies, bodies, headers and query string', () => {
    const event = scrubEvent({
      user: { email: 'a@b.c' },
      extra: { note: 'x' },
      request: { url: 'https://www.dwellduel.com/markets?token=1#x', cookies: { s: '1' }, data: 'stake=5', headers: { cookie: 'x' }, query_string: 'token=1' },
    })
    expect(event).toEqual({ request: { url: 'https://www.dwellduel.com/markets' } })
  })
})

describe('scrubEvent, second pass', () => {
  it('strips the query from the request path captureRequestError records', () => {
    const event = scrubEvent({ contexts: { nextjs: { request_path: '/callback?code=abc#x', router_kind: 'App Router' } } })
    expect(event.contexts?.nextjs).toEqual({ request_path: '/callback', router_kind: 'App Router' })
  })

  it('drops every breadcrumb, which can hold raw error details and Supabase query strings', () => {
    expect(scrubEvent({ breadcrumbs: [{ category: 'console', data: { arguments: [{ details: 'Key (x)=(secret)' }] } }] })).toEqual({})
  })

  it('records no breadcrumbs at all, on either side', async () => {
    const { sentryOptions } = await import('@/lib/observability/sentry-options')
    expect(sentryOptions().beforeBreadcrumb()).toBeNull()
    expect('tracesSampleRate' in sentryOptions()).toBe(false)
  })
})

describe('pingHeartbeat', () => {
  it('does nothing without a URL', async () => {
    const f = vi.fn()
    expect(await pingHeartbeat(undefined, true, f as never)).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })

  it('never throws when the ping fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await pingHeartbeat('https://hc-ping.com/x/', false, f as never)).toBe(false)
    expect(f.mock.calls[0][0]).toBe('https://hc-ping.com/x/fail')
  })
})

describe('isDeliberateRaise', () => {
  it('trusts only a plain raise exception', () => {
    expect(isDeliberateRaise({ code: 'P0001' })).toBe(true)
    expect(isDeliberateRaise({ code: '57014' })).toBe(false)
    expect(isDeliberateRaise({})).toBe(false)
  })
})
