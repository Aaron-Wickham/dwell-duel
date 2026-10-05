import { StatusChip, type StatusChipTone } from '@/components/ui/status-chip'
import type { LegStatus } from '@/lib/parlays/leg-status'
import { legTally, tallySummary } from '@/lib/parlays/get-parlay'
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
  awaiting: 'Waiting for a result',
  won: 'Won',
  lost: 'Lost',
  voided: 'Called off',
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

// A pick's result as a word, not a pill, on My bets' parlay card and the parlay's page (#393): a
// pick still to play out is Waiting, open or closed.
const LEG_WORD: Record<LegStatus, { label: string; className: string }> = {
  open: { label: 'Waiting', className: 'text-ink2' },
  awaiting: { label: 'Waiting', className: 'text-ink2' },
  won: { label: 'Won', className: 'font-extrabold text-win' },
  lost: { label: 'Lost', className: 'font-extrabold text-loss' },
  voided: { label: 'Called off', className: 'text-ink2' },
}

export function LegResult({ status }: { status: LegStatus }) {
  const { label, className } = LEG_WORD[status]
  return <span className={cn('shrink-0 whitespace-nowrap', className)}>{label}</span>
}

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
