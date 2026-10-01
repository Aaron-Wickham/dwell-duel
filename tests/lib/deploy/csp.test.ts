import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig from '../../../next.config'

async function policy(): Promise<Map<string, string>> {
  const rules = (await nextConfig.headers?.()) ?? []
  const value = rules.find((rule) => rule.source === '/:path*')?.headers.find((h) => h.key === 'Content-Security-Policy')?.value ?? ''
  return new Map(value.split('; ').map((directive) => [directive.split(' ')[0], directive] as [string, string]))
}

afterEach(() => vi.unstubAllEnvs())

describe('the CSP and Google’s sign-in button', () => {
  it('allows nothing from Google without a client ID', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '')
    expect([...(await policy()).values()].join('; ')).not.toContain('accounts.google.com')
  })

  it('allows exactly the paths Google documents once a client ID is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'client.apps.googleusercontent.com')
    const csp = await policy()
    expect(csp.get('script-src')).toContain(' https://accounts.google.com/gsi/client')
    expect(csp.get('style-src')).toContain(' https://accounts.google.com/gsi/style')
    expect(csp.get('frame-src')).toBe("frame-src 'self' https://accounts.google.com/gsi/")
    expect(csp.get('connect-src')).toContain(' https://accounts.google.com/gsi/')
    // Still nothing frames the app, and forms still post only to it.
    expect(csp.get('frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(csp.get('form-action')).toBe("form-action 'self'")
  })
})
