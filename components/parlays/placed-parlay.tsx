import Link from 'next/link'
import { LocalTime } from '@/components/ui/local-time'
import { StatusChip } from '@/components/ui/status-chip'
import type { LegStatus } from '@/lib/parlays/leg-status'
import type { ParlayView } from '@/lib/parlays/list-parlays'
import { formatOdds, MAX_MULTIPLIER } from '@/lib/parlays/odds'
import { focusTarget } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'

const LEG_PILL: Record<LegStatus, string> = {
  pending: 'bg-gold-soft text-gold',
  won: 'bg-acc-soft text-acc-text',
  lost: 'bg-loss-soft text-loss',
  voided: 'bg-sunk text-ink2',
}

function StatusBadge({ parlay }: { parlay: ParlayView }) {
  switch (parlay.status) {
    case 'pending':
      return <StatusChip tone="wait">Pending</StatusChip>
    case 'won':
      return <StatusChip tone="done">Won {parlay.credited} DC</StatusChip>
    case 'lost':
      return <StatusChip tone="lost">Lost</StatusChip>
    case 'refunded':
      return <StatusChip tone="void">Refunded</StatusChip>
  }
}

function terms(p: ParlayView): string {
  if (p.status === 'refunded') return `${p.stake} DC returned`
  const odds = `${p.stake} DC at ${formatOdds(p.multiplierBp)}×${p.capped ? ` (capped at ${MAX_MULTIPLIER}×)` : ''}`
  return p.status === 'pending' ? `${odds} · pays ${p.potentialPayout} DC if every pick wins` : odds
}

// A parlay in My bets' list: a card inside the row, so it reads as one wager with its legs.
export function PlacedParlay({ parlay, domId }: { parlay: ParlayView; domId?: string }) {
  const titleId = domId ? `${domId}-title` : undefined
  return (
    <li {...focusTarget(domId, titleId)} className="py-3">
      <div className="flex flex-col gap-2 rounded-[14px] border border-line p-3.5 md:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p id={titleId} className="font-bold">
              Parlay · {parlay.legs.length} picks
            </p>
            <p className="text-sm text-ink2">
              {terms(parlay)} · Placed <LocalTime iso={parlay.createdAt} format="dateTime" />
            </p>
          </div>
          <div className="shrink-0">
            <StatusBadge parlay={parlay} />
          </div>
        </div>
        <ul className="flex flex-col divide-y divide-line border-t border-line">
          {parlay.legs.map((leg) => (
            <li key={leg.marketId} className="flex items-center justify-between gap-3 py-2 text-[15px]">
              <span className="min-w-0 grow break-words">
                <Link href={`/markets/${leg.marketId}`} transitionTypes={['nav-forward']} className="hit-area">
                  {leg.marketTitle}
                </Link>
                {' — '}
                <strong>{leg.outcomeLabel}</strong>
              </span>
              <span
                className={cn(
                  'inline-flex h-6 items-center whitespace-nowrap rounded-full px-[9px] text-xs font-extrabold',
                  LEG_PILL[leg.status],
                )}
              >
                {leg.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}
