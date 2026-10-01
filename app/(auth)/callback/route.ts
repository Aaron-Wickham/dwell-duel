import { NextResponse } from 'next/server'
import { serverClient } from '@/lib/supabase/server'
import { createOwnProfile } from '@/lib/auth/create-own-profile'
import { FALLBACK_NAME } from '@/lib/profile/fallback-name'
import { NEXT_COOKIE, safeNextPath } from '@/lib/auth/next-path'

function cookieValue(request: Request, name: string): string | null {
  for (const pair of request.headers.get('cookie')?.split(';') ?? []) {
    const [key, ...rest] = pair.trim().split('=')
    if (key !== name) continue
    try {
      return decodeURIComponent(rest.join('='))
    } catch {
      return null
    }
  }
  return null
}

// The sign-in page's cookie names where to go after, checked again here: a cookie is only as
// trustworthy as whatever last wrote it.
function redirectClearingNext(url: string): NextResponse {
  const response = NextResponse.redirect(url)
  response.cookies.set(NEXT_COOKIE, '', { path: '/callback', maxAge: 0 })
  return response
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNextPath(cookieValue(request, NEXT_COOKIE))

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
          return redirectClearingNext(`${origin}${next ?? '/'}`)
        }
        if (result.reason === 'not_invited') {
          await supabase.auth.signOut({ scope: 'local' })
          return redirectClearingNext(`${origin}/not-invited`)
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
  return NextResponse.redirect(`${origin}/sign-in?error=auth${next ? `&next=${encodeURIComponent(next)}` : ''}`)
}
