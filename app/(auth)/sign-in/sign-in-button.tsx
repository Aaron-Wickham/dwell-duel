'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { browserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/ui/message'
import { LeafLoader } from '@/components/brand/leaf-loader'

export function SignInButton() {
  const searchParams = useSearchParams()
  const hasError = searchParams.get('error') === 'auth'
  // Google's page can take a moment to arrive; until it does, the button says so.
  const [redirecting, setRedirecting] = useState(false)

  async function signIn() {
    if (redirecting) return
    setRedirecting(true)
    const supabase = browserClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/callback` },
    })
    if (error) setRedirecting(false)
  }

  return (
    <div className="flex w-full flex-col gap-5">
      {hasError && <Message tone="error">Something went wrong signing you in. Try again.</Message>}
      <Button type="button" onClick={signIn} block aria-disabled={redirecting || undefined}>
        {redirecting ? (
          <>
            <LeafLoader />
            <span role="status">Opening Google…</span>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="flex size-[26px] items-center justify-center rounded-full bg-white text-[15px] font-extrabold text-[#03272D]">
              G
            </span>
            Sign in with Google
          </>
        )}
      </Button>
    </div>
  )
}
