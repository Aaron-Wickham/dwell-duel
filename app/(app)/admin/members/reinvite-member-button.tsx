'use client'

import type { MemberSummary } from '@/lib/members/list-members'
import { reinviteMemberAction } from '@/lib/admin/owner-actions'
import { Button } from '@/components/ui/button'
import { ConfirmActionButton } from '@/components/ui/confirm-action-button'

// Words only, like every secondary button (#387).
const trigger = 'Invite again'

// Owner only, for a removed member: it gives them access back, so it asks first (#265). An invite
// is an email, so a member with none on file can't be invited again; the button says why instead
// of failing in reinvite_member.
export function ReinviteMemberButton({ member }: { member: MemberSummary }) {
  const id = `reinvite-member-${member.id}`
  if (!member.email.trim()) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="secondary" block aria-disabled="true" aria-describedby={`${id}-hint`} aria-label={`Invite ${member.displayName} again`}>
          {trigger}
        </Button>
        <p id={`${id}-hint`} className="text-sm text-ink2">
          There’s no email on file for {member.displayName}, so there’s nothing to invite. Add their Google email under Invites instead.
        </p>
      </div>
    )
  }
  return (
    <ConfirmActionButton
      id={id}
      trigger={trigger}
      triggerLabel={`Invite ${member.displayName} again`}
      triggerVariant="secondary"
      block
      title={`Invite ${member.displayName} again?`}
      description={`${member.displayName} can sign in again straight away, as a Member, and is ranked again. Their coins, bets and history are as they left them.`}
      confirmLabel="Invite again"
      successMessage={`${member.displayName} invited again.`}
      action={reinviteMemberAction.bind(null, member.id)}
    />
  )
}
