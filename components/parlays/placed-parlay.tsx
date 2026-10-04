import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { ListCard } from '@/components/ui/list-card'
import { LocalTime } from '@/components/ui/local-time'
import { formatOdds } from '@/lib/parlays/odds'
import type { ParlayView } from '@/lib/parlays/list-parlays'
import { focusTarget } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'
import { FIGURE_TONE, LegPill, ParlayProgress, ParlayStatusChip, outcomeFigure } from './parlay-parts'
import { uiTextClass, figureInlineClass, rowTitleClass } from '@/components/ui/page'
import { formatDcAmount } from '@/lib/format/dc'

// A card shows this many picks; the rest are one tap away on the parlay's page.
const PREVIEW_LEGS = 3

function Figure({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-ink2">{label}</span>
      <span className={cn(figureInlineClass, 'whitespace-nowrap', className)}>{value}</span>
    </div>
  )
}

// A parlay in My bets' list: one card, tappable as a whole (the title link stretches over it),
// leading to its breakdown. Its picks are plain text here, so no link sits inside another.
export function PlacedParlay({ parlay, domId }: { parlay: ParlayView; domId?: string }) {
  const titleId = domId ? `${domId}-title` : undefined
  const figure = outcomeFigure(parlay)
  const shown = parlay.legs.slice(0, PREVIEW_LEGS)
  const hidden = parlay.legs.length - shown.length
  const multiplier = `${parlay.estimated ? '~' : ''}${formatOdds(parlay.multiplierBp)}×`

  return (
    <ListCard {...focusTarget(domId, titleId)} className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            id={titleId}
            href={`/parlays/${parlay.id}`}
            transitionTypes={['nav-forward']}
            className={cn(rowTitleClass, 'stretched-link text-ink no-underline')}
          >
            Parlay · {parlay.legs.length} picks
          </Link>
          <p className="text-sm text-ink2">
            Placed <LocalTime iso={parlay.createdAt} format="dateTime" />
          </p>
        </div>
        <div className="shrink-0">
          <ParlayStatusChip parlay={parlay} />
        </div>
      </div>

      <div className="grid grid-cols-3 items-end gap-2">
        <Figure label="Stake" value={formatDcAmount(parlay.stake)} />
        <Figure label={parlay.capped ? `Multiplier (max ${parlay.maxMultiplier}×)` : 'Multiplier'} value={multiplier} />
        <Figure label={figure.label} value={figure.value} className={FIGURE_TONE[figure.tone]} />
      </div>

      <ParlayProgress legs={parlay.legs} />

      <ul className="flex flex-col divide-y divide-line border-t border-line">
        {shown.map((leg) => (
          <li key={leg.marketId} className={`flex items-center justify-between gap-3 py-2 ${uiTextClass}`}>
            <span className="min-w-0 grow break-words">
              {leg.marketTitle}
              {' — '}
              <strong>{leg.outcomeLabel}</strong>
            </span>
            <LegPill status={leg.status} />
          </li>
        ))}
      </ul>

      <p aria-hidden="true" className="flex items-center justify-between text-sm font-bold text-ink2">
        <span>{hidden > 0 ? `+${hidden} more ${hidden === 1 ? 'pick' : 'picks'} · View breakdown` : 'View breakdown'}</span>
        <ChevronRight className="size-4" />
      </p>
    </ListCard>
  )
}
