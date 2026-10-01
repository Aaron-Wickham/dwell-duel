'use client'

import { UserRoundPlus } from 'lucide-react'
import type { MemberSummary } from '@/lib/members/list-members'
import { reinviteMemberAction } from '@/lib/admin/owner-actions'
import { ConfirmActionButton } from '@/components/ui/confirm-action-button'

// Owner only, for a removed member: it gives them access back, so it asks first (#265).
export function ReinviteMemberButton({ member }: { member: MemberSummary }) {
  return (
    <ConfirmActionButton
      id={`reinvite-member-${member.id}`}
      trigger={
        <>
          <UserRoundPlus aria-hidden="true" className="size-[18px]" />
          Invite again
        </>
      }
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
