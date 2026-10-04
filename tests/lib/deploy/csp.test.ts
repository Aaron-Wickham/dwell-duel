import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig from '../../../next.config'

async function policy(): Promise<Map<string, string>> {
  const rules = (await nextConfig.headers?.()) ?? []
  const value = rules.find((rule) => rule.source === '/:path*')?.headers.find((h) => h.key === 'Content-Security-Policy')?.value ?? ''
  return new Map(value.split('; ').map((directive) => [directive.split(' ')[0], directive] as [string, string]))
}

afterEach(() => vi.unstubAllEnvs())

describe('the CSP and Google sign-in', () => {
  it.each(['', 'client.apps.googleusercontent.com'])('allows nothing from Google, with client ID %j', async (clientId) => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', clientId)
    const csp = await policy()
    expect([...csp.values()].join('; ')).not.toContain('accounts.google.com')
    // Nothing frames the app, and its own forms post only to it.
    expect(csp.get('frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(csp.get('form-action')).toBe("form-action 'self'")
  })
})
