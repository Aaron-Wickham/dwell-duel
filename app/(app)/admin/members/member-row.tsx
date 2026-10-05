import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { MemberSummary } from '@/lib/members/list-members'
import { focusTarget } from '@/lib/pagination/row-id'
import { Avatar } from '@/components/ui/avatar'
import { ListCard } from '@/components/ui/list-card'
import { rowTitleClass } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import { MemberActivity } from './member-activity'
import { MemberChip } from './member-chip'
import { formatDcAmount } from '@/lib/format/dc'

// One member on Admin › Members, read-only: the card opens their Admin page, where the forms are
// (#254). A list card on the page (D2). Named by its title, so "Show more" focus announces the name.
export function MemberRow({ member, domId, now }: { member: MemberSummary; domId: string; now: number }) {
  const titleId = `${domId}-name`
  return (
    <ListCard
      {...focusTarget(domId, titleId)}
      className="flex items-start gap-3"
    >
      <Avatar name={member.displayName} src={member.avatarSrc} />
      <div className="flex min-w-0 grow flex-col">
        <span className="flex flex-wrap items-center gap-2">
          <Link
            id={titleId}
            href={`/admin/members/${member.id}`}
            transitionTypes={['nav-forward']}
            className={cn(rowTitleClass, 'stretched-link min-w-0 break-words text-ink no-underline')}
          >
            {member.displayName}
          </Link>
          <MemberChip member={member} />
        </span>
        {/* The only way an admin can match a Google account to a member (#195). */}
        {member.email && <span className="text-sm text-ink2 wrap-anywhere">{member.email}</span>}
        <span className="text-sm text-ink2">
          <strong className="font-extrabold whitespace-nowrap text-ink">{formatDcAmount(member.balance)}</strong>
          {' · '}
          <MemberActivity joinedAt={null} lastSignInAt={member.lastSignInAt} now={now} />
        </span>
      </div>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 self-center text-ink2" />
    </ListCard>
  )
}
