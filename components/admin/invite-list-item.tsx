import type { ReactNode } from 'react'
import type { InviteRow } from '@/lib/invites/list-invites'
import { focusTarget } from '@/lib/pagination/row-id'
import { LocalTime } from '@/components/ui/local-time'

export function InviteListItem({ invite, actions, domId }: { invite: InviteRow; actions: ReactNode; domId?: string }) {
  return (
    <li
      {...focusTarget(domId)}
      className="flex min-h-16 flex-col justify-center gap-2 py-2.5 md:flex-row md:items-center md:justify-between md:gap-3"
    >
      <div className="flex min-w-0 flex-col">
        <span className="wrap-anywhere">
          {invite.email}
          {invite.claimed && (
            <>
              {' '}
              <span className="text-ink2">(claimed)</span>
            </>
          )}
        </span>
        <span className="text-sm text-ink2">
          Added <LocalTime iso={invite.createdAt} format="day" />
        </span>
      </div>
      {!invite.claimed && <div className="flex flex-wrap items-start gap-2 md:shrink-0 md:justify-end">{actions}</div>}
    </li>
  )
}
