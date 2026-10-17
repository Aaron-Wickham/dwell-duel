import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAppPath } from '@/lib/auth/app-paths'
import { safeNextPath } from '@/lib/auth/next-path'
import { isAuthUnavailable, readClaims } from '@/lib/auth/auth-unavailable'
import { fetchWithTimeout, SERVER_FETCH_TIMEOUT_MS } from '@/lib/supabase/timeout-fetch'
import { contentSecurityPolicy, newNonce } from '@/lib/security/csp'
import { INLINE_SCRIPT_HASHES } from '@/lib/security/script-hashes'

// The service worker precaches it anonymously, and it must load with no auth round trip.
const OFFLINE_PATH = '/offline'

export async function proxy(request: NextRequest) {
  // A fresh nonce per request (#449). Next reads it from the request's own CSP header while it
  // renders and puts it on each of its scripts; the response carries the same policy. The offline
  // page's cached copy keeps the headers it was fetched with, so its nonce still matches.
  const csp = contentSecurityPolicy({ nonce: newNonce(), scriptHashes: INLINE_SCRIPT_HASHES })
  request.headers.set('content-security-policy', csp)
  const withCsp = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', csp)
    return res
  }

  if (request.nextUrl.pathname === OFFLINE_PATH) return withCsp(NextResponse.next({ request }))

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
      global: { fetch: fetchWithTimeout(SERVER_FETCH_TIMEOUT_MS) },
    },
  )

  const { data, error } = await readClaims(supabase)
  // Auth itself is unavailable (network, timeout, 5xx, 429): pass the request through
  // unredirected, so the page's own requireUser() throws into the error boundary instead of
  // bouncing a member with a live session to sign-in.
  if (error && isAuthUnavailable(error)) return withCsp(response)

  // A page's own redirect('/sign-in') runs after its loading skeleton has streamed, so the
  // browser gets a 200 and a client-side hop. Redirecting here keeps it a real 307. Only
  // page loads: a server action posted without a session still reaches its own check.
  const isPageLoad = request.method === 'GET' || request.method === 'HEAD'
  if (!data && isPageLoad && isAppPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    // The page asked for comes along, so a shared market link still lands on the market (#263).
    const next = safeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`)
    url.pathname = '/sign-in'
    url.search = next ? `?next=${encodeURIComponent(next)}` : ''
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  return withCsp(response)
}

// Not on a Link prefetch (#251): a signed-in page is dynamic, so each prefetch is its own
// invocation, and the proxy would double it. The prefetched layout's requireUser still guards it,
// and the navigation that follows runs the proxy, which refreshes the session cookie and turns a
// signed-out load into a real redirect.
export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|sw\\.js$|api/cron/|api/health$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|txt|xml)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
