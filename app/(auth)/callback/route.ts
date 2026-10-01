import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { serverClient } from '@/lib/supabase/server'
import { createOwnProfile } from '@/lib/auth/create-own-profile'
import { FALLBACK_NAME } from '@/lib/profile/fallback-name'
import { NEXT_COOKIE, safeNextPath } from '@/lib/auth/next-path'
import { NOT_INVITED_EMAIL_COOKIE, NOT_INVITED_EMAIL_MAX_AGE, NOT_INVITED_PATH } from '@/lib/auth/not-invited'

// The sign-in page's cookie names where to go after, checked again here: a cookie is only as
// trustworthy as whatever last wrote it.
async function readNext(): Promise<string | null> {
  return safeNextPath((await cookies()).get(NEXT_COOKIE)?.value ?? null)
}

async function clearNext(): Promise<void> {
  ;(await cookies()).set(NEXT_COOKIE, '', { path: '/callback', maxAge: 0 })
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = await readNext()
  const withNext = (path: string) => `${origin}${path}${next ? `${path.includes('?') ? '&' : '?'}next=${encodeURIComponent(next)}` : ''}`

  if (code) {
    const supabase = await serverClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const result = await createOwnProfile(
          supabase,
          user.id,
          user.email ?? '',
          user.user_metadata.full_name ?? user.email ?? FALLBACK_NAME,
          user.user_metadata.avatar_url ?? null,
        )

        if (result.ok) {
          await clearNext()
          return NextResponse.redirect(`${origin}${next ?? '/'}`)
        }
        if (result.reason === 'not_invited') {
          await supabase.auth.signOut({ scope: 'local' })
          // next rides on in /not-invited's URL now, so the cookie mustn't linger for a later sign-in.
          await clearNext()
          // Says which account was refused, and keeps the destination for the right one.
          if (user.email) {
            ;(await cookies()).set(NOT_INVITED_EMAIL_COOKIE, user.email, {
              path: NOT_INVITED_PATH,
              maxAge: NOT_INVITED_EMAIL_MAX_AGE,
              httpOnly: true,
              sameSite: 'lax',
              secure: origin.startsWith('https:'),
            })
          }
          return NextResponse.redirect(withNext(NOT_INVITED_PATH))
        }
      }

      // Either createOwnProfile hit a genuine error, or getUser() returned
      // no user despite a successful code exchange — either way a session
      // may have been established; never leave it half-authenticated. Only
      // this session, though: a transient error here mustn't sign an
      // existing member out of every other device (#194).
      await supabase.auth.signOut({ scope: 'local' })
    }
  }

  // Back to sign-in with the same destination, so trying again still lands there.
  return NextResponse.redirect(withNext('/sign-in?error=auth'))
}
