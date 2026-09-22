import { NextResponse } from 'next/server'
import { serverClient } from '@/lib/supabase/server'
import { createOwnProfile } from '@/lib/auth/create-own-profile'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

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
          user.user_metadata.full_name ?? user.email ?? 'Member',
          user.user_metadata.avatar_url ?? null,
        )

        if (result.ok) {
          return NextResponse.redirect(`${origin}/`)
        }
        if (result.reason === 'not_invited') {
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/not-invited`)
        }
      }

      // Either createOwnProfile hit a genuine error, or getUser() returned
      // no user despite a successful code exchange — either way a session
      // may have been established; never leave it half-authenticated.
      await supabase.auth.signOut()
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth`)
}
