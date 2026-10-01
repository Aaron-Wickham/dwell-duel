import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import type { DbClient } from '@/lib/supabase/database'
import { createOwnProfile } from '@/lib/auth/create-own-profile'
import { FALLBACK_NAME } from '@/lib/profile/fallback-name'
import { NOT_INVITED_EMAIL_COOKIE, NOT_INVITED_EMAIL_MAX_AGE, NOT_INVITED_PATH } from '@/lib/auth/not-invited'

export type SignInError = 'auth' | 'expired'

// What both ways in share once Supabase has a session: /callback (Supabase's OAuth redirect) and
// /auth/google (Google's own button). Returns where to send the browser.
export async function finishSignIn(supabase: DbClient, user: User | null, origin: string, next: string | null): Promise<string> {
  if (user) {
    const result = await createOwnProfile(
      supabase,
      user.id,
      user.email ?? '',
      user.user_metadata.full_name ?? user.email ?? FALLBACK_NAME,
      user.user_metadata.avatar_url ?? null,
    )

    if (result.ok) return `${origin}${next ?? '/'}`
    if (result.reason === 'not_invited') {
      await supabase.auth.signOut({ scope: 'local' })
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
      return withNext(origin, NOT_INVITED_PATH, next)
    }
  }

  // Either createOwnProfile hit a genuine error, or there's no user despite a session — either way
  // a session may have been established; never leave it half-authenticated. Only this session,
  // though: a transient error here mustn't sign an existing member out of every other device (#194).
  await supabase.auth.signOut({ scope: 'local' })
  return signInFailed(origin, next)
}

// Back to sign-in with the same destination, so trying again still lands there.
export function signInFailed(origin: string, next: string | null, error: SignInError = 'auth'): string {
  return withNext(origin, `/sign-in?error=${error}`, next)
}

function withNext(origin: string, path: string, next: string | null): string {
  return `${origin}${path}${next ? `${path.includes('?') ? '&' : '?'}next=${encodeURIComponent(next)}` : ''}`
}
