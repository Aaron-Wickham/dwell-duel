'use client'

import { useSearchParams } from 'next/navigation'
import { browserClient } from '@/lib/supabase/client'

export function SignInButton() {
  const searchParams = useSearchParams()
  const hasError = searchParams.get('error') === 'auth'

  async function signIn() {
    const supabase = browserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/callback` },
    })
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {hasError && <p className="text-sm text-red-600">Something went wrong signing you in. Try again.</p>}
      <button onClick={signIn} className="rounded-md bg-foreground px-4 py-2 text-background">
        Sign in with Google
      </button>
    </div>
  )
}
