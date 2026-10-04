'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/ui/message'
import { LeafLoader } from '@/components/brand/leaf-loader'
import { GoogleMark } from '@/components/sign-in/google-mark'
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

// Through Supabase's redirect, whose account chooser names the Supabase project.
async function startSupabase(next: string | null) {
  rememberNext(next)
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
}

// Straight to Google, which posts the ID token back to /auth/google, so its chooser names
// dwellduel.com. The route sets the nonce, state and `next` cookies and says where to go.
async function startDirect(next: string | null) {
  const response = await fetch('/auth/google/nonce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ next }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Google sign-in: ${response.status}`)
  const { url } = (await response.json()) as { url?: unknown }
  if (typeof url !== 'string') throw new Error('Google sign-in: no URL')
  window.location.assign(url)
}

// `direct` with a Google client ID set. After a failed direct sign-in, an `alternative` Supabase
// button shows beneath, so a fault on that path (a client ID Supabase doesn't list, a blocked
// cookie) never leaves members with no way in.
export function SignInButton({ direct = false, alternative = false }: { direct?: boolean; alternative?: boolean }) {
  const searchParams = useSearchParams()
  const next = safeNextPath(searchParams.get('next'))
  const failedBefore = searchParams.has('error')
  // Google's page can take a moment to arrive; until it does, the button says so.
  const [redirecting, setRedirecting] = useState(false)
  // A redirect that never started (Google or Supabase unreachable) used to put the button back
  // with no word about why (#221).
  const [failed, setFailed] = useState(false)

  async function signIn() {
    if (redirecting) return
    setRedirecting(true)
    setFailed(false)
    try {
      await (direct ? startDirect(next) : startSupabase(next))
    } catch {
      setRedirecting(false)
      setFailed(true)
    }
  }

  return (
    <div className="flex w-full flex-col gap-5">
      {!alternative && <SignInError />}
      {failed && <Message tone="error">Couldn’t open Google sign-in. Check your connection and try again.</Message>}
      <Button type="button" variant={alternative ? 'secondary' : 'primary'} onClick={signIn} block aria-disabled={redirecting || undefined}>
        {redirecting ? (
          <>
            <LeafLoader />
            <span role="status">Opening Google…</span>
          </>
        ) : alternative ? (
          'Try another way'
        ) : (
          <>
            <GoogleMark />
            Sign in with Google
          </>
        )}
      </Button>
      {direct && failedBefore && <SignInButton alternative />}
    </div>
  )
}
