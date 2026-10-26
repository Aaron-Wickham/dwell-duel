'use client'

import { useSearchParams } from 'next/navigation'
import { Message } from '@/components/ui/message'

// Where a failed sign-in comes back to: /callback and /auth/google send ?error=.
export function SignInError() {
  const error = useSearchParams().get('error')
  if (error === 'expired') {
    return <Message tone="error">That sign-in expired or was started in another tab. Try again.</Message>
  }
  if (error === 'auth') return <Message tone="error">Google didn’t sign you in. Try again with the account your invite was sent to.</Message>
  return null
}
