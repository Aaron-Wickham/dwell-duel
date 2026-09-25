'use client'

import { useActionState } from 'react'
import { revokeInviteAction } from '@/lib/invites/actions'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/ui/message'

export function RevokeInviteButton({ email }: { email: string }) {
  const [state, formAction] = useActionState(revokeInviteAction, undefined)

  return (
    <form action={formAction} className="flex shrink-0 flex-col items-end gap-2">
      <input type="hidden" name="email" value={email} />
      {/* An aria-label rather than a visually hidden suffix: the e2e suite finds the invite by its email, which must appear as text only once. */}
      <Button type="submit" variant="danger" size="sm" aria-label={`Revoke ${email}`}>
        Revoke
      </Button>
      {state?.formError && <Message tone="error">{state.formError}</Message>}
    </form>
  )
}
