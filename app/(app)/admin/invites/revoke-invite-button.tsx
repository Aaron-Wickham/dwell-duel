'use client'

import { revokeInviteAction } from '@/lib/invites/actions'
import { ConfirmActionButton, type ConfirmActionState } from '@/components/ui/confirm-action-button'

export function RevokeInviteButton({ email }: { email: string }) {
  async function revoke(prev: ConfirmActionState, formData: FormData) {
    formData.set('email', email)
    return revokeInviteAction(prev, formData)
  }

  return (
    // The trigger is named by aria-label rather than a visually hidden suffix: the e2e suite finds
    // the invite by its email, which must appear as text only once.
    <ConfirmActionButton
      id={`revoke-${email}`}
      trigger="Revoke"
      triggerLabel={`Revoke ${email}`}
      triggerSize="sm"
      className="shrink-0 items-end"
      title="Revoke this invite?"
      description={`${email} won’t be able to join with this invite. You can invite them again later.`}
      confirmLabel="Revoke invite"
      successMessage="Invite revoked."
      action={revoke}
    />
  )
}
