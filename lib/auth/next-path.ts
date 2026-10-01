import { isAppPath } from './app-paths'

// Where sign-in returns to (#263). The sign-in page keeps it in this cookie for the OAuth round trip,
// rather than in redirectTo, so Supabase's redirect allow-list needn't take a query string.
export const NEXT_COOKIE = 'sign-in-next'
export const NEXT_COOKIE_MAX_AGE = 60 * 10

const MAX_LENGTH = 2048
const PLACEHOLDER_ORIGIN = 'https://dwellduel.invalid'

// A signed-in app path on this site, as a path and query, or null. Anything that could leave the
// site is refused before it is parsed: a protocol-relative `//host`, a backslash (browsers read
// `/\host` as `//host`), a scheme, and control characters. Home is null too, since it's where
// sign-in goes anyway.
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > MAX_LENGTH) return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null
  let url: URL
  try {
    url = new URL(raw, PLACEHOLDER_ORIGIN)
  } catch {
    return null
  }
  if (url.origin !== PLACEHOLDER_ORIGIN || url.pathname === '/' || !isAppPath(url.pathname)) return null
  return `${url.pathname}${url.search}`
}
