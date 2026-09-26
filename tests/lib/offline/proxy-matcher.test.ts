import { describe, it, expect } from 'vitest'
import { config } from '@/proxy'

// The service worker, the offline page and the manifest must load with no session and no
// auth round trip: a redirected /sw.js fails the worker's install.
describe('proxy matcher', () => {
  const pattern = new RegExp(`^${config.matcher[0]}$`)

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
    expect(pattern.test(pathname)).toBe(runs)
  })
})
