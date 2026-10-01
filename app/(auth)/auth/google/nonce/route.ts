import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { NEXT_COOKIE, safeNextPath } from '@/lib/auth/next-path'
import { googleCookieOptions, GOOGLE_NONCE_COOKIE, GOOGLE_NONCE_MAX_AGE, hashNonce, newNonce } from '@/lib/auth/google-sign-in'

// The sign-in page asks for a nonce before it shows Google's button. The raw value stays in an
// httpOnly cookie for /auth/google; the page only ever sees its hash, which goes to Google. `next`
// rides beside it, since Google's POST to /auth/google can't carry a query string.
export async function POST(request: Request) {
  // Only the sign-in page itself: another site has no business resetting a sign-in in progress.
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return new NextResponse(null, { status: 403 })

  let next: string | null = null
  try {
    const body: unknown = await request.json()
    if (body && typeof body === 'object' && 'next' in body && typeof body.next === 'string') next = safeNextPath(body.next)
  } catch {
    // No body: no destination.
  }

  const options = googleCookieOptions(new URL(request.url).origin)
  const nonce = newNonce()
  const jar = await cookies()
  jar.set(GOOGLE_NONCE_COOKIE, nonce, { ...options, maxAge: GOOGLE_NONCE_MAX_AGE })
  // With no `next`, an older one is cleared, so it can't send this sign-in somewhere stale.
  jar.set(NEXT_COOKIE, next ?? '', { ...options, maxAge: next ? GOOGLE_NONCE_MAX_AGE : 0 })

  return NextResponse.json({ nonce: hashNonce(nonce) }, { headers: { 'Cache-Control': 'no-store' } })
}
