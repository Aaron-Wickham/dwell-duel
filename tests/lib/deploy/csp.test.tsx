import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig from '../../../next.config'
import { contentSecurityPolicy, newNonce } from '@/lib/security/csp'
import { INLINE_SCRIPT_HASHES, scriptHash } from '@/lib/security/script-hashes'
import { PLAY_ONCE_PER_SESSION, SHOW_ON_COLD_START, STANDALONE_ZOOM_LOCK } from '@/lib/app-shell/inline-scripts'
import { renderToStaticMarkup } from 'react-dom/server'
import { LaunchScreen } from '@/components/brand/launch-screen'
import { StandaloneZoomLock } from '@/components/app-shell/standalone-zoom-lock'
import { SignInIntro } from '@/components/sign-in/sign-in-intro'

function directives(value: string): Map<string, string> {
  return new Map(value.split('; ').map((directive) => [directive.split(' ')[0], directive] as [string, string]))
}

async function configHeaders(source: string) {
  const rules = (await nextConfig.headers?.()) ?? []
  return rules.find((rule) => rule.source === source)?.headers ?? []
}

afterEach(() => vi.unstubAllEnvs())

describe('the CSP and Google sign-in', () => {
  it.each(['', 'client.apps.googleusercontent.com'])('allows nothing from Google, with client ID %j', (clientId) => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', clientId)
    const csp = directives(contentSecurityPolicy({ nonce: newNonce(), scriptHashes: INLINE_SCRIPT_HASHES }))
    expect([...csp.values()].join('; ')).not.toContain('accounts.google.com')
    // Nothing frames the app, and its own forms post only to it.
    expect(csp.get('frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(csp.get('form-action')).toBe("form-action 'self'")
  })
})

describe('script-src (#449)', () => {
  it('allows inline script only by the request’s nonce or one of the app’s own hashes', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const script = directives(contentSecurityPolicy({ nonce: 'abc123==', scriptHashes: ["'sha256-x'"] })).get('script-src')
    expect(script).toBe("script-src 'self' 'nonce-abc123==' 'sha256-x' https://va.vercel-scripts.com")
    expect(script).not.toContain('unsafe-inline')
  })

  it('adds unsafe-eval in development only', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(contentSecurityPolicy({ nonce: null })).toContain("'unsafe-eval'")
    vi.stubEnv('NODE_ENV', 'production')
    expect(contentSecurityPolicy({ nonce: null })).not.toContain("'unsafe-eval'")
  })

  it('keeps inline styles allowed', () => {
    expect(directives(contentSecurityPolicy({ nonce: null })).get('style-src')).toBe("style-src 'self' 'unsafe-inline'")
  })

  // Next only finds a nonce in base64 characters (get-script-nonce-from-header.ts).
  it('makes a fresh nonce Next can read, every time', () => {
    const nonces = new Set(Array.from({ length: 20 }, newNonce))
    expect(nonces.size).toBe(20)
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/)
  })

  it('hashes exactly the text each pre-paint script renders', () => {
    const sha = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`
    expect(INLINE_SCRIPT_HASHES).toEqual([SHOW_ON_COLD_START, STANDALONE_ZOOM_LOCK, PLAY_ONCE_PER_SESSION].map(sha))
  })

  // What the browser hashes is the rendered text, so check that rather than the constants alone.
  it.each([
    ['LaunchScreen', LaunchScreen],
    ['StandaloneZoomLock', StandaloneZoomLock],
    ['SignInIntro', SignInIntro],
  ])('allows %s’s script by its hash', (_name, Component) => {
    const html = renderToStaticMarkup(<Component />)
    // React renders these tags itself, so plain string search is enough here.
    const scripts = html.split('<script').slice(1).map((rest) => rest.slice(rest.indexOf('>') + 1, rest.indexOf('</script>')))
    expect(scripts).toHaveLength(1)
    expect(INLINE_SCRIPT_HASHES).toContain(scriptHash(scripts[0]))
  })

  // The proxy sets the page policy; a second one from next.config would be enforced as well and,
  // without the nonce, block Next's own scripts.
  it('sends no page CSP from next.config, only the service worker’s', async () => {
    expect((await configHeaders('/:path*')).map((h) => h.key)).not.toContain('Content-Security-Policy')
    const worker = (await configHeaders('/sw.js')).find((h) => h.key === 'Content-Security-Policy')?.value ?? ''
    expect(worker).toContain("worker-src 'self'")
    expect(directives(worker).get('script-src')).toBe("script-src 'self' https://va.vercel-scripts.com")
  })
})
