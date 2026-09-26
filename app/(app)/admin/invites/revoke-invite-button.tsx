'use client'

import { useActionState } from 'react'
import { revokeInviteAction } from '@/lib/invites/actions'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'

export function RevokeInviteButton({ email }: { email: string }) {
  const [state, formAction] = useActionState(revokeInviteAction, undefined)
  const errorId = `revoke-${email}-error`

  return (
    <form action={formAction} className="flex shrink-0 flex-col items-end gap-2">
      <input type="hidden" name="email" value={email} />
      {/* An aria-label rather than a visually hidden suffix: the e2e suite finds the invite by its email, which must appear as text only once. */}
      <FormSubmitButton
        variant="danger"
        size="sm"
        aria-label={`Revoke ${email}`}
        aria-describedby={state?.formError ? errorId : undefined}
      >
        Revoke
      </FormSubmitButton>
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
    </form>
  )
}
