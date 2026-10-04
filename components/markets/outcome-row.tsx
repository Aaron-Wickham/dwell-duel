import { Layers, Trophy } from 'lucide-react'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { AnimatedText } from '@/components/ui/animated-text'
import { StatusChip } from '@/components/ui/status-chip'
import { OutcomeSlipControl } from '@/components/markets/outcome-slip-control'
import type { ToastActionResult } from '@/components/ui/toast-action-form'
import { SERIES_BG } from '@/components/markets/series-classes'
import type { Series } from '@/lib/markets/outcome-series'
import type { OutcomeRowState } from '@/lib/markets/row-state'
import type { SlipPick } from '@/lib/parlays/get-slip'
import { formatOdds } from '@/lib/parlays/odds'
import { rowTitleClass } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import { formatDcAmount } from '@/lib/format/dc'

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
  riding = 0,
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
  // DC in pending parlays with a leg on this outcome (#279). Shown on its own, beside the bar and the
  // percentage: on an LMSR market a leg's shares are already in the price, and an older pool
  // parlay never moved the pool.
  riding?: number
  slipPick: SlipPick
  addAction: (formData: FormData) => ToastActionResult | Promise<ToastActionResult>
  removeAction: (formData: FormData) => ToastActionResult | Promise<ToastActionResult>
  disabledReasonId?: string
}) {
  const percent = (probability ?? 0) * 100

  return (
    <div className="flex flex-col gap-2 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', SERIES_BG[series])} />
          <span className={cn(rowTitleClass, 'min-w-0 wrap-break-word')}>{label}</span>
          {winner && (
            <StatusChip tone="won">
              <Trophy aria-hidden="true" className="size-4" />
              Winner
            </StatusChip>
          )}
        </span>
        <span className="shrink-0 font-extrabold whitespace-nowrap">
          <AnimatedText plainText={`${Math.round(percent)}% (${formatDcAmount(poolTotal)})`}>
            <AnimatedNumber value={Math.round(percent)} locales="en-US" suffix="% (" />
            <AnimatedNumber value={poolTotal} locales="en-US" suffix=" DC)" />
          </AnimatedText>
        </span>
      </div>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-sunk">
        <span className={cn('block h-full rounded-full', SERIES_BG[series])} style={{ width: `${percent}%` }} />
      </div>
      {riding > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-ink2">
          <Layers aria-hidden="true" className="size-4 shrink-0" />
          <span>+{formatDcAmount(riding)} riding in parlays</span>
        </p>
      )}
      {state !== 'none' && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-ink2">
            {oddsBp !== null && (
              <AnimatedText plainText={`${formatOdds(oddsBp)}× payout per DC`}>
                <AnimatedNumber
                  value={Number(formatOdds(oddsBp))}
                  locales="en-US"
                  format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
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
