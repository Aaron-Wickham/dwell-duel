import { IntentLink } from '@/components/ui/intent-link'
import { Avatar } from '@/components/ui/avatar'
import { focusTarget } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'
import { StatusChip } from '@/components/ui/status-chip'
import { formatDc } from '@/lib/format/dc'

// Your own row, and the bar standing in for it, stick to the bottom of the viewport, above the
// phone's tab bar, until the page scrolls them into their place.
export const stickyMineClass =
  'sticky bottom-[calc(82px+var(--safe-bottom))] z-[2] -mx-3 rounded-tile bg-acc-soft px-3 [--tint-inset:0] before:rounded-[inherit] md:bottom-0'

export function RankNumber({ rank, label = `Rank ${rank}` }: { rank: number; label?: string }) {
  return (
    <span
      className={cn(
        'flex h-8 min-w-8 shrink-0 items-center font-extrabold tabular-nums',
        // Lime only for first place (D4).
        rank === 1 ? 'justify-center rounded-full bg-lime px-2 text-on-lime' : 'text-ink2',
      )}
    >
      <span aria-hidden="true">{rank}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

// The column drops the unit, as the approved board does; a screen reader still hears it.
export function scoreText(score: number, signed: boolean): string {
  return signed && score > 0 ? `+${formatDc(score)}` : formatDc(score)
}

// A divided row on the page (D2, #396): every part but the name keeps its width, and the name
// truncates on one line, so a phone never breaks it a letter at a time.
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
      className={cn('pressable hover-tint relative flex min-h-14 items-center gap-3 py-2.5', isMe && stickyMineClass)}
    >
      <RankNumber rank={rank} />
      <Avatar name={name} src={avatarSrc} size="sm" />
      <span className="flex min-w-0 grow items-baseline gap-1 font-extrabold">
        <IntentLink href={href} transitionTypes={['nav-forward']} className="stretched-link min-w-0 truncate text-ink no-underline">
          {name}
        </IntentLink>
        {isMe && <span className="shrink-0 font-bold text-ink2">(you)</span>}
      </span>
      {record && record.won + record.lost > 0 && (
        // The member page and Your standing carry the record too, so a phone leaves it out for room.
        <StatusChip tone="void" size="sm" className="hidden shrink-0 md:inline-flex">
          <span aria-hidden="true">{record.won}-{record.lost}</span>
          <span className="sr-only">{record.won} won, {record.lost} lost</span>
        </StatusChip>
      )}
      <span className="shrink-0 text-right font-extrabold whitespace-nowrap tabular-nums">
        {scoreText(score, signed)}
        <span className="sr-only"> DC</span>
      </span>
    </li>
  )
}
