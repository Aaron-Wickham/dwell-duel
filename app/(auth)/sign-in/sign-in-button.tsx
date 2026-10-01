'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/ui/message'
import { LeafLoader } from '@/components/brand/leaf-loader'
import { NEXT_COOKIE, NEXT_COOKIE_MAX_AGE, safeNextPath } from '@/lib/auth/next-path'
import { SignInError } from './sign-in-error'

// Only /callback reads it, and it outlives the round trip through Google by a few minutes at most.
// With no `next`, an older one is cleared, so it can't send a later sign-in somewhere stale.
function rememberNext(next: string | null) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  const value = next ? encodeURIComponent(next) : ''
  const maxAge = next ? NEXT_COOKIE_MAX_AGE : 0
  document.cookie = `${NEXT_COOKIE}=${value}; Path=/callback; Max-Age=${maxAge}; SameSite=Lax${secure}`
}

export function SignInButton() {
  const searchParams = useSearchParams()
  const next = safeNextPath(searchParams.get('next'))
  // Google's page can take a moment to arrive; until it does, the button says so.
  const [redirecting, setRedirecting] = useState(false)
  // A redirect that never started (Google or Supabase unreachable) used to put the button back
  // with no word about why (#221).
  const [failed, setFailed] = useState(false)

  async function signIn() {
    if (redirecting) return
    setRedirecting(true)
    setFailed(false)
    rememberNext(next)
    try {
      // Loaded on tap rather than imported, so the sign-in page doesn't ship the Supabase client.
      const { browserClient } = await import('@/lib/supabase/client')
      const supabase = browserClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        // Always Google's account chooser, so "Try another account" can't quietly reuse the
        // account that wasn't invited (#263).
        options: { redirectTo: `${window.location.origin}/callback`, queryParams: { prompt: 'select_account' } },
      })
      if (error) throw error
    } catch {
      setRedirecting(false)
      setFailed(true)
    }
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <SignInError />
      {failed && <Message tone="error">Couldn’t open Google sign-in. Check your connection and try again.</Message>}
      <Button type="button" onClick={signIn} block aria-disabled={redirecting || undefined}>
        {redirecting ? (
          <>
            <LeafLoader />
            <span role="status">Opening Google…</span>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="flex size-[26px] items-center justify-center rounded-full bg-on-primary text-[15px] font-extrabold text-primary">
              G
            </span>
            Sign in with Google
          </>
        )}
      </Button>
    </div>
  )
}
