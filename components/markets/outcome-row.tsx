import { Trophy } from 'lucide-react'
import NumberFlow from '@number-flow/react'
import { AnimatedText } from '@/components/ui/animated-text'
import { StatusChip } from '@/components/ui/status-chip'
import { OutcomeSlipControl } from '@/components/markets/outcome-slip-control'
import { SERIES_BG } from '@/components/markets/series-classes'
import type { Series } from '@/lib/markets/outcome-series'
import type { OutcomeRowState } from '@/lib/markets/row-state'
import type { SlipPick } from '@/lib/parlays/get-slip'
import { formatOdds } from '@/lib/parlays/odds'
import { cn } from '@/lib/utils'

// Re-exported for existing importers (e.g. this file's own test) -- the type lives in
// lib/markets/row-state.ts now, next to the pure function that produces its values.
export type { OutcomeRowState }

export function OutcomeRow({
  label,
  poolTotal,
  probability,
  oddsBp,
  series,
  state,
  winner = false,
  slipPick,
  addAction,
  removeAction,
  disabledReasonId,
}: {
  label: string
  poolTotal: number
  probability: number | null
  oddsBp: number | null
  series: Series
  state: OutcomeRowState
  winner?: boolean
  slipPick: SlipPick
  addAction: (formData: FormData) => void | boolean | Promise<void | boolean>
  removeAction: (formData: FormData) => void | boolean | Promise<void | boolean>
  disabledReasonId?: string
}) {
  const percent = (probability ?? 0) * 100

  return (
    <div className="flex flex-col gap-2 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', SERIES_BG[series])} />
          <span className="min-w-0 text-[17px] font-extrabold wrap-break-word">{label}</span>
          {winner && (
            <StatusChip tone="done">
              <Trophy aria-hidden="true" className="size-4" />
              Winner
            </StatusChip>
          )}
        </span>
        <span className="shrink-0 font-extrabold tabular-nums">
          <AnimatedText plainText={`${Math.round(percent)}% (${poolTotal} DC)`}>
            <NumberFlow value={Math.round(percent)} locales="en-US" format={{ useGrouping: false }} suffix="% (" />
            <NumberFlow value={poolTotal} locales="en-US" format={{ useGrouping: false }} suffix=" DC)" />
          </AnimatedText>
        </span>
      </div>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-sunk">
        <span className={cn('block h-full rounded-full', SERIES_BG[series])} style={{ width: `${percent}%` }} />
      </div>
      {state !== 'none' && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-ink2">
            {oddsBp !== null && (
              <AnimatedText plainText={`${formatOdds(oddsBp)}× payout per DC`}>
                <NumberFlow
                  value={Number(formatOdds(oddsBp))}
                  locales="en-US"
                  format={{ minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }}
                  suffix="× payout per DC"
                />
              </AnimatedText>
            )}
          </span>
          <OutcomeSlipControl
            pick={slipPick}
            state={state}
            addAction={addAction}
            removeAction={removeAction}
            disabledReasonId={disabledReasonId}
          />
        </div>
      )}
    </div>
  )
}
