'use client'

import { useSearchParams } from 'next/navigation'
import { browserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/ui/message'

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
    <div className="flex w-full flex-col gap-5">
      {hasError && <Message tone="error">Something went wrong signing you in. Try again.</Message>}
      <Button type="button" onClick={signIn} block>
        <span aria-hidden="true" className="flex size-[26px] items-center justify-center rounded-full bg-white text-[15px] font-extrabold text-[#03272D]">
          G
        </span>
        Sign in with Google
      </Button>
    </div>
  )
}
