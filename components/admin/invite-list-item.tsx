import type { ReactNode } from 'react'
import type { InviteRow } from '@/lib/invites/list-invites'

export function InviteListItem({ invite, actions }: { invite: InviteRow; actions: ReactNode }) {
  return (
    <li className="flex min-h-16 flex-col justify-center gap-2 py-2.5 md:flex-row md:items-center md:justify-between md:gap-3">
      <span className="wrap-anywhere">
        {invite.email}
        {invite.claimed && (
          <>
            {' '}
            <span className="text-ink2">(claimed)</span>
          </>
        )}
      </span>
      {!invite.claimed && <div className="flex flex-wrap items-start gap-2 md:shrink-0 md:justify-end">{actions}</div>}
    </li>
  )
}
