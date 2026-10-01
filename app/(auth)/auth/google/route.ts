import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { serverClient } from '@/lib/supabase/server'
import { reportError } from '@/lib/observability/report'
import { NEXT_COOKIE, safeNextPath } from '@/lib/auth/next-path'
import { finishSignIn, signInFailed, type SignInError } from '@/lib/auth/finish-sign-in'
import { csrfMatches, GOOGLE_CSRF_COOKIE, GOOGLE_NONCE_COOKIE, googleCookieOptions, hashNonce, idTokenNonce } from '@/lib/auth/google-sign-in'

// Google's sign-in button (redirect mode) POSTs here with the member's ID token. 303 everywhere:
// the browser follows with a GET.
export async function POST(request: Request) {
  const { origin } = new URL(request.url)
  const jar = await cookies()
  const next = safeNextPath(jar.get(NEXT_COOKIE)?.value ?? null)
  const rawNonce = jar.get(GOOGLE_NONCE_COOKIE)?.value ?? null
  const csrfCookie = jar.get(GOOGLE_CSRF_COOKIE)?.value ?? null
  // Single use, however this ends: a retry starts again from the sign-in page with a new nonce.
  jar.set(GOOGLE_NONCE_COOKIE, '', { ...googleCookieOptions(origin), maxAge: 0 })
  jar.set(NEXT_COOKIE, '', { ...googleCookieOptions(origin), maxAge: 0 })

  const fail = (reason: string, error: SignInError = 'auth') => {
    reportError(`Sign-in with Google: ${reason}`, new Error(reason))
    return NextResponse.redirect(signInFailed(origin, next, error), 303)
  }

  const form = await request.formData().catch(() => null)
  const credential = form?.get('credential')
  const csrfBody = form?.get('g_csrf_token')
  if (typeof credential !== 'string' || !credential) return fail('no credential')
  // Google's double submit: only script on our own origin could have set the cookie to match.
  if (!csrfMatches(csrfCookie, csrfBody)) return fail('CSRF token mismatch')
  // A missing or different nonce is a sign-in that outlived its page, or one begun in another tab.
  if (!rawNonce) return fail('no nonce cookie', 'expired')
  if (idTokenNonce(credential) !== hashNonce(rawNonce)) return fail('nonce mismatch', 'expired')

  const supabase = await serverClient()
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: credential, nonce: rawNonce })
  if (error) {
    reportError('Sign-in with Google: signInWithIdToken failed', error)
    return NextResponse.redirect(signInFailed(origin, next), 303)
  }

  return NextResponse.redirect(await finishSignIn(supabase, data.user, origin, next), 303)
}
