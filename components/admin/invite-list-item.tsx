import type { ReactNode } from 'react'
import type { InviteRow } from '@/lib/invites/list-invites'

export function InviteListItem({ invite, revoke }: { invite: InviteRow; revoke: ReactNode }) {
  return (
    <li className="flex min-h-16 items-center justify-between gap-3 py-2.5">
      <span className="wrap-anywhere">
        {invite.email}
        {invite.claimed && (
          <>
            {' '}
            <span className="text-ink2">(claimed)</span>
          </>
        )}
      </span>
      {!invite.claimed && revoke}
    </li>
  )
}
