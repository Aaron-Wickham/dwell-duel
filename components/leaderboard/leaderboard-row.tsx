import { IntentLink } from '@/components/ui/intent-link'
import { Avatar } from '@/components/ui/avatar'
import { rowTitleClass } from '@/components/ui/page'
import { focusTarget } from '@/lib/pagination/row-id'
import { signedDc } from '@/lib/social/season'
import { cn } from '@/lib/utils'

export function LeaderboardRow({
  rank,
  name,
  avatarSrc = null,
  score,
  signed = false,
  record,
  isMe,
  href,
  domId,
}: {
  rank: number
  name: string
  avatarSrc?: string | null
  score: number
  // A month's profit shows its sign; net worth never goes below zero.
  signed?: boolean
  // Settled wins and losses, all time; a member who hasn't had a bet settle has none to show.
  record?: { won: number; lost: number }
  isMe: boolean
  href: string
  domId?: string
}) {
  return (
    <li
      {...focusTarget(domId)}
      className={cn('pressable hover-tint relative flex min-h-[60px] items-center gap-3 rounded-[12px] px-2.5 py-2.5 [--tint-inset:0] md:px-3.5', isMe && 'bg-acc-soft')}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-control text-lg font-extrabold tabular-nums',
          rank === 1 ? 'bg-lime text-on-lime' : 'bg-sunk text-ink',
        )}
      >
        <span aria-hidden="true">{rank}</span>
        <span className="sr-only">Rank {rank}</span>
      </span>
      <Avatar name={name} src={avatarSrc} />
      <span className={cn(rowTitleClass, 'min-w-0 grow break-words')}>
        <IntentLink href={href} transitionTypes={['nav-forward']} className="stretched-link">
          {name}
        </IntentLink>
        {isMe && <span className="font-semibold text-ink2"> (you)</span>}
      </span>
      {record && record.won + record.lost > 0 && (
        <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-sunk px-2 text-xs font-extrabold text-ink2 tabular-nums">
          <span aria-hidden="true">{record.won}-{record.lost}</span>
          <span className="sr-only">{record.won} won, {record.lost} lost</span>
        </span>
      )}
      <span className={cn(rowTitleClass, 'shrink-0 whitespace-nowrap tabular-nums')}>{signed ? signedDc(score) : `${score} DC`}</span>
    </li>
  )
}
