import Link from 'next/link'
import { Avatar } from '@/components/ui/avatar'
import { cardClass } from '@/components/ui/card'
import { signedDc } from '@/lib/social/season'
import { cn } from '@/lib/utils'
import { uiTextClass } from '@/components/ui/page'
import { formatDcAmount } from '@/lib/format/dc'

export interface PodiumMember {
  id: string
  name: string
  avatarSrc: string | null
  score: number
  rank: number
}

// Block heights by finishing place, so the winner stands tallest; ties share a place, and so a height.
const BLOCK = { 1: 'h-[72px] bg-lime text-on-lime', 2: 'h-[48px] bg-sunk text-ink', 3: 'h-[34px] bg-sunk text-ink' } as const

// Where each place stands: the winner in the middle, flanked by second and third. The list itself
// stays in rank order, so a screen reader and the Tab key meet first place first.
const PLACE_ORDER = { 1: 'order-2', 2: 'order-1', 3: 'order-3' } as const

function Place({ member, signed, meId }: { member: PodiumMember; signed: boolean; meId: string }) {
  const place = Math.min(member.rank, 3) as 1 | 2 | 3
  return (
    <li className={cn('pressable hover-tint relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-t-segment text-center', PLACE_ORDER[place])}>
      <Avatar name={member.name} src={member.avatarSrc} size={place === 1 ? 'lg' : 'md'} />
      <Link href={`/members/${member.id}`} transitionTypes={['nav-forward']} className={`stretched-link max-w-full ${uiTextClass} font-extrabold text-ink line-clamp-3 wrap-break-word`}>
        {member.name}
      </Link>
      {member.id === meId && <span className="-mt-1 text-xs font-bold text-ink2">you</span>}
      <span className="text-sm font-bold whitespace-nowrap text-ink2">
        {signed ? signedDc(member.score) : formatDcAmount(member.score)}
      </span>
      <span
        className={cn('mt-1 flex w-full items-start justify-center rounded-t-segment pt-1.5 text-lg font-extrabold tabular-nums', BLOCK[place])}
      >
        <span aria-hidden="true">{member.rank}</span>
        <span className="sr-only">Rank {member.rank}</span>
      </span>
    </li>
  )
}

// The top three, second and third flanking the winner. Only for the top of a board of at least
// three: a window that starts mid-board has no podium.
export function Podium({ members, signed, meId }: { members: PodiumMember[]; signed: boolean; meId: string }) {
  return (
    <section aria-labelledby="podium-heading" className={cn(cardClass, 'p-4 md:p-6')}>
      <h2 id="podium-heading" className="sr-only">
        Top three
      </h2>
      <ol className="flex items-end justify-center gap-3 md:gap-6">
        {members.slice(0, 3).map((member) => (
          <Place key={member.id} member={member} signed={signed} meId={meId} />
        ))}
      </ol>
    </section>
  )
}
