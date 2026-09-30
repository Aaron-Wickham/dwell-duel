'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/ui/message'
import { LeafLoader } from '@/components/brand/leaf-loader'

export function SignInButton() {
  const searchParams = useSearchParams()
  const hasError = searchParams.get('error') === 'auth'
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
      // Loaded on tap rather than imported, so the sign-in page doesn't ship the Supabase client.
      const { browserClient } = await import('@/lib/supabase/client')
      const supabase = browserClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/callback` },
      })
      if (error) throw error
    } catch {
      setRedirecting(false)
      setFailed(true)
    }
  }

  return (
    <div className="flex w-full flex-col gap-5">
      {hasError && <Message tone="error">Something went wrong signing you in. Try again.</Message>}
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
