import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { serverClient } from '@/lib/supabase/server'
import { reportError } from '@/lib/observability/report'
import { NEXT_COOKIE, safeNextPath } from '@/lib/auth/next-path'
import { finishSignIn, signInFailed } from '@/lib/auth/finish-sign-in'

// The sign-in page's cookie names where to go after, checked again here: a cookie is only as
// trustworthy as whatever last wrote it.
async function readNext(): Promise<string | null> {
  return safeNextPath((await cookies()).get(NEXT_COOKIE)?.value ?? null)
}

// Wherever this goes next carries `next` itself, so the cookie mustn't linger for a later sign-in.
async function clearNext(): Promise<void> {
  ;(await cookies()).set(NEXT_COOKIE, '', { path: '/callback', maxAge: 0 })
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = await readNext()

  if (code) {
    const supabase = await serverClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) reportError('Sign-in: code exchange failed', error)
    else {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const destination = await finishSignIn(supabase, user, origin, next)
      await clearNext()
      return NextResponse.redirect(destination)
    }
  }

  return NextResponse.redirect(signInFailed(origin, next))
}
