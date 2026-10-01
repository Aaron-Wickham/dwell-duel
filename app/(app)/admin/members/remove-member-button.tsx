'use client'

import { UserRoundX } from 'lucide-react'
import type { MemberSummary } from '@/lib/members/list-members'
import { removeMemberAction } from '@/lib/admin/owner-actions'
import { ConfirmActionButton } from '@/components/ui/confirm-action-button'

// Owner only, and never for the owner: the page leaves it out and remove_member refuses anyway.
export function RemoveMemberButton({ member }: { member: MemberSummary }) {
  return (
    <ConfirmActionButton
      id={`remove-member-${member.id}`}
      trigger={
        <>
          <UserRoundX aria-hidden="true" className="size-[18px]" />
          Remove from DwellDuel
        </>
      }
      triggerLabel={`Remove ${member.displayName} from DwellDuel`}
      triggerVariant="danger"
      block
      title={`Remove ${member.displayName} from DwellDuel?`}
      description={`${member.displayName} loses their invite and any role straight away, and their devices stop getting notifications. Their coins, bets and history stay, and inviting them again brings them back.`}
      confirmLabel="Remove member"
      successMessage={`${member.displayName} removed.`}
      action={removeMemberAction.bind(null, member.id)}
    />
  )
}
