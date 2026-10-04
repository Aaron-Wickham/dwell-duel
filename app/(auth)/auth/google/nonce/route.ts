import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { NEXT_COOKIE, safeNextPath } from '@/lib/auth/next-path'
import {
  googleAuthorizeUrl,
  googleCookieOptions,
  GOOGLE_NONCE_COOKIE,
  GOOGLE_NONCE_MAX_AGE,
  GOOGLE_STATE_COOKIE,
  hashNonce,
  newNonce,
} from '@/lib/auth/google-sign-in'

// The sign-in button asks here for where to send the member. The raw nonce and the state stay in
// httpOnly cookies for /auth/google; the page only ever sees Google's URL, which carries the nonce's
// hash. `next` rides beside them, since Google's POST to /auth/google can't carry a query string.
export async function POST(request: Request) {
  // Only the sign-in page itself: another site has no business resetting a sign-in in progress.
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return new NextResponse(null, { status: 403 })
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) return new NextResponse(null, { status: 404 })

  let next: string | null = null
  try {
    const body: unknown = await request.json()
    if (body && typeof body === 'object' && 'next' in body && typeof body.next === 'string') next = safeNextPath(body.next)
  } catch {
    // No body: no destination.
  }

  const origin = new URL(request.url).origin
  const options = googleCookieOptions(origin)
  const nonce = newNonce()
  const state = newNonce()
  const jar = await cookies()
  jar.set(GOOGLE_NONCE_COOKIE, nonce, { ...options, maxAge: GOOGLE_NONCE_MAX_AGE })
  jar.set(GOOGLE_STATE_COOKIE, state, { ...options, maxAge: GOOGLE_NONCE_MAX_AGE })
  // With no `next`, an older one is cleared, so it can't send this sign-in somewhere stale.
  jar.set(NEXT_COOKIE, next ?? '', { ...options, maxAge: next ? GOOGLE_NONCE_MAX_AGE : 0 })

  const url = googleAuthorizeUrl({ origin, clientId, nonce: hashNonce(nonce), state })
  return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } })
}
