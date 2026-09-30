import Link from 'next/link'
import type { MemberSummary } from '@/lib/members/list-members'
import { ROLE_LABELS } from '@/lib/auth/roles'
import { Avatar } from '@/components/ui/avatar'
import { StatusChip } from '@/components/ui/status-chip'
import { MemberActivity } from './member-activity'

const ROLE_TONE = { owner: 'done', admin: 'open', reviewer: 'wait' } as const

export function MemberIdentity({ member, now }: { member: MemberSummary; now: number }) {
  return (
    <div className="pressable hover-lift-row relative flex items-center gap-3 rounded-control md:w-60 md:shrink-0 md:self-center lg:w-auto lg:self-auto">
      <Avatar name={member.displayName} src={member.avatarSrc} />
      <div className="flex min-w-0 grow flex-col">
        <span className="flex flex-wrap items-center gap-2">
          <Link href={`/members/${member.id}`} transitionTypes={['nav-forward']} className="stretched-link font-extrabold">
            {member.displayName}
          </Link>
          {member.role !== 'member' && <StatusChip tone={ROLE_TONE[member.role]}>{ROLE_LABELS[member.role]}</StatusChip>}
        </span>
        {/* The only way an admin can match a Google account to a member (#195). */}
        {member.email && <span className="text-sm text-ink2 wrap-anywhere">{member.email}</span>}
        <span className="text-sm text-ink2 tabular-nums">{member.balance} DC</span>
        <MemberActivity joinedAt={member.joinedAt} lastSignInAt={member.lastSignInAt} now={now} />
      </div>
    </div>
  )
}
