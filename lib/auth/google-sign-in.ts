import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

// Google Identity Services in redirect mode: Google POSTs the ID token to this path on our own
// domain, which is why its account chooser names dwellduel.com rather than the Supabase project.
// It must match an authorized redirect URI on the Google client exactly, so it carries no query.
export const GOOGLE_LOGIN_PATH = '/auth/google'
export const GOOGLE_NONCE_PATH = '/auth/google/nonce'
export const GOOGLE_NONCE_COOKIE = 'google-nonce'
// Set by Google's own script on our origin, and posted back beside the credential (double submit).
export const GOOGLE_CSRF_COOKIE = 'g_csrf_token'
// Long enough for a sign-in page left open a while; the nonce is single-use either way.
export const GOOGLE_NONCE_MAX_AGE = 60 * 60

// Google's POST is cross-site, and a Lax cookie isn't sent on a cross-site POST, so over https
// they're SameSite=None (which needs Secure). Plain http (local dev) can't hold a Secure cookie in
// every browser, so there they fall back to Lax: fine for a same-site POST, not for Google's.
export function googleCookieOptions(origin: string) {
  const https = origin.startsWith('https:')
  return { path: GOOGLE_LOGIN_PATH, httpOnly: true, sameSite: https ? 'none' : 'lax', secure: https } as const
}

// Google's double submit, compared in constant time.
export function csrfMatches(cookie: string | null, body: unknown): boolean {
  if (!cookie || typeof body !== 'string') return false
  const a = Buffer.from(cookie)
  const b = Buffer.from(body)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function newNonce(): string {
  return randomBytes(32).toString('base64url')
}

// Supabase compares the token's nonce claim with the SHA-256 of the raw nonce, as hex, so Google
// gets the hash and signInWithIdToken the raw value.
export function hashNonce(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

// The claim as written, unverified: only to tell a stale or crossed nonce apart from a bad token.
// Supabase verifies the token itself.
export function idTokenNonce(credential: string): string | null {
  const payload = credential.split('.')[1]
  if (!payload) return null
  try {
    const nonce: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).nonce
    return typeof nonce === 'string' ? nonce : null
  } catch {
    return null
  }
}
