import Link from 'next/link'
import type { LegStatus } from '@/lib/parlays/leg-status'
import type { ParlayView } from '@/lib/parlays/list-parlays'
import { formatOdds } from '@/lib/parlays/odds'
import { cn } from '@/lib/utils'

const STATUS: Record<ParlayView['status'], { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'text-gold' },
  won: { label: 'Won', className: 'text-win' },
  lost: { label: 'Lost', className: 'text-loss' },
  refunded: { label: 'Refunded', className: 'text-ink2' },
}

const LEG_PILL: Record<LegStatus, string> = {
  pending: 'bg-gold-soft text-gold',
  won: 'bg-acc-soft text-acc-text',
  lost: 'bg-loss-soft text-loss',
  voided: 'bg-sunk text-ink2',
}

function terms(p: ParlayView): string {
  const odds = `${formatOdds(p.multiplierBp)}×`
  switch (p.status) {
    case 'pending':
      return ` — ${p.stake} DC at ${odds} — pays ${p.potentialPayout} DC if every pick wins`
    case 'won':
      return ` — ${p.stake} DC at ${odds} — paid ${p.credited} DC`
    case 'lost':
      return ` — ${p.stake} DC at ${odds}`
    case 'refunded':
      return ` — ${p.stake} DC returned`
  }
}

export function PlacedParlay({ parlay }: { parlay: ParlayView }) {
  const status = STATUS[parlay.status]
  return (
    <li className="flex flex-col gap-2 py-4">
      <p>
        <span className={cn('font-extrabold', status.className)}>{status.label}</span>
        {`${terms(parlay)}${parlay.capped ? ' (capped at 20×)' : ''}`}
      </p>
      <ul className="flex flex-col">
        {parlay.legs.map((leg) => (
          <li key={leg.marketId} className="flex items-center justify-between gap-3 py-2 text-[15px]">
            <span className="min-w-0 grow">
              <Link
                href={`/markets/${leg.marketId}`}
                transitionTypes={['nav-forward']}
                className="inline-flex min-h-11 items-center"
              >
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
    </li>
  )
}
