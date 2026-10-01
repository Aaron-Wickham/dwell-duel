import { describe, it, expect } from 'vitest'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { config } from '@/proxy'

function runsFor(url: string, headers?: Record<string, string>): boolean {
  return unstable_doesMiddlewareMatch({ config, url, headers })
}

describe('proxy matcher', () => {
  // The service worker, the offline page and the manifest must load with no session and no
  // auth round trip: a redirected /sw.js fails the worker's install.
  it.each([
    ['/', true],
    ['/markets', true],
    ['/markets/3f2a', true],
    ['/sign-in', true],
    ['/offline-report', true],
    ['/api/cron/keep-alive', false],
    ['/api/cronjobs', true],
    ['/sw.js', false],
    ['/offline', false],
    ['/manifest.webmanifest', false],
    ['/_next/static/chunks/main.js', false],
    ['/favicon.ico', false],
    ['/android-chrome-192.png', false],
  ])('%s runs the proxy: %s', (pathname, runs) => {
    expect(runsFor(pathname)).toBe(runs)
  })

  // #251: a prefetch is an invocation of its own, and the page's layout still checks the session.
  it('skips a Link prefetch of an app page', () => {
    expect(runsFor('/markets', { 'next-router-prefetch': '1' })).toBe(false)
    expect(runsFor('/markets', { purpose: 'prefetch' })).toBe(false)
  })

  // A navigation, a router.refresh() and a server action all run it: they are what refreshes the
  // session cookie, and a signed-out page load still gets its real redirect.
  it('runs for an RSC navigation or refresh that is not a prefetch', () => {
    expect(runsFor('/markets', { rsc: '1' })).toBe(true)
    expect(runsFor('/markets', { 'next-action': 'abc' })).toBe(true)
  })
})
