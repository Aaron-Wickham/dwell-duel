'use client'

import { useActionState } from 'react'
import { addInviteAction } from '@/lib/invites/actions'
import { Input } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { withSuccessToast } from '@/lib/toast/with-success-toast'

export function AddInviteForm() {
  const [state, formAction] = useActionState(
    withSuccessToast(addInviteAction, (s) => Boolean(s?.formError), 'Invite added.'),
    undefined,
  )

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="invite-email" className="text-[15px] font-bold">
        Email
      </label>
      <div className="flex gap-2">
        <Input
          id="invite-email"
          name="email"
          type="email"
          required
          maxLength={TEXT_LIMITS.inviteEmail}
          placeholder="friend@gmail.com"
          className="min-w-0"
          aria-invalid={Boolean(state?.formError)}
          aria-describedby={state?.formError ? 'invite-email-hint add-invite-error' : 'invite-email-hint'}
        />
        <FormSubmitButton className="shrink-0">Add</FormSubmitButton>
      </div>
      <p id="invite-email-hint" className="text-sm text-ink2">
        They can sign in with this Google account right away.
      </p>
      {state?.formError && (
        <Message tone="error" id="add-invite-error">
          {state.formError}
        </Message>
      )}
    </form>
  )
}
