import { StatusChip, type StatusChipTone } from '@/components/ui/status-chip'
import type { LegStatus } from '@/lib/parlays/leg-status'
import { legTally, tallySummary } from '@/lib/parlays/get-parlay'
import type { ParlayView } from '@/lib/parlays/list-parlays'
import { cn } from '@/lib/utils'

const LEG_TONE: Record<LegStatus, StatusChipTone> = {
  open: 'wait',
  awaiting: 'wait',
  won: 'won',
  lost: 'lost',
  voided: 'void',
}

const LEG_LABEL: Record<LegStatus, string> = {
  open: 'Open',
  awaiting: 'Awaiting resolution',
  won: 'Won',
  lost: 'Lost',
  voided: 'Voided',
}

const SEGMENT: Record<LegStatus, string> = {
  won: 'bg-win',
  lost: 'bg-loss',
  open: 'bg-line',
  awaiting: 'bg-line',
  voided: 'border border-line bg-sunk',
}

export function LegPill({ status }: { status: LegStatus }) {
  return (
    <StatusChip tone={LEG_TONE[status]} size="sm">
      {LEG_LABEL[status]}
    </StatusChip>
  )
}

// A pending parlay is Open while a pick can still be bet on; once every market has closed it waits
// on their results, like a solo bet does.
export function ParlayStatusChip({
  parlay,
  className,
}: {
  parlay: Pick<ParlayView, 'status' | 'credited'> & { legs?: { status: LegStatus }[] }
  className?: string
}) {
  switch (parlay.status) {
    case 'pending': {
      const awaiting = parlay.legs !== undefined && parlay.legs.length > 0 && parlay.legs.every((leg) => leg.status !== 'open')
      return awaiting ? (
        <StatusChip tone="wait" className={className}>Awaiting resolution</StatusChip>
      ) : (
        <StatusChip tone="open" className={className}>Open</StatusChip>
      )
    }
    case 'won':
      return <StatusChip tone="won" className={className}>Won {parlay.credited} DC</StatusChip>
    case 'lost':
      return <StatusChip tone="lost" className={className}>Lost</StatusChip>
    case 'refunded':
      return <StatusChip tone="void" className={className}>Refunded</StatusChip>
  }
}

// The third figure of the card and the detail's hero: what it pays while open (an estimate until
// every leg's odds are set at close), then what it did.
export function outcomeFigure(p: Pick<ParlayView, 'status' | 'credited' | 'stake' | 'potentialPayout' | 'estimated'>): {
  label: string
  value: string
  tone: 'win' | 'loss' | 'plain'
} {
  switch (p.status) {
    case 'pending':
      return { label: 'Pays if all win', value: `${p.estimated ? '~' : ''}${p.potentialPayout} DC`, tone: 'win' }
    case 'won':
      return { label: 'Won', value: `${p.credited} DC`, tone: 'win' }
    case 'lost':
      return { label: 'Result', value: 'Lost', tone: 'loss' }
    case 'refunded':
      return { label: 'Returned', value: `${p.stake} DC`, tone: 'plain' }
  }
}

export const FIGURE_TONE = { win: 'text-acc-text', loss: 'text-loss', plain: 'text-ink' } as const

// One segment per pick, in order: how far along the parlay is, at a glance.
export function ParlayProgress({ legs, className }: { legs: { status: LegStatus }[]; className?: string }) {
  const summary = tallySummary(legTally(legs))
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div aria-hidden="true" className="flex gap-[3px]">
        {legs.map((leg, i) => (
          <span key={i} className={cn('h-1.5 flex-1 rounded-full', SEGMENT[leg.status])} />
        ))}
      </div>
      <p className="text-sm text-ink2">{summary}</p>
    </div>
  )
}
