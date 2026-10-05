'use client'

import { Check } from 'lucide-react'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { AnimatedText } from '@/components/ui/animated-text'
import { StatusChip } from '@/components/ui/status-chip'
import { OutcomeSlipControl, useInSlip } from '@/components/markets/outcome-slip-control'
import type { ToastActionResult } from '@/components/ui/toast-action-form'
import { SERIES_BG } from '@/components/markets/series-classes'
import type { Series } from '@/lib/markets/outcome-series'
import type { OutcomeRowState } from '@/lib/markets/row-state'
import type { SlipPick } from '@/lib/parlays/get-slip'
import { EXAMPLE_STAKE } from '@/lib/parlays/solo-pays'
import { figureInlineClass, rowTitleClass } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import { formatDc, formatDcAmount } from '@/lib/format/dc'

// Re-exported for existing importers (e.g. this file's own test) -- the type lives in
// lib/markets/row-state.ts now, next to the pure function that produces its values.
export type { OutcomeRowState }

// One outcome: its name, its chance, and the button that adds it to the slip. Under the name, what
// EXAMPLE_STAKE wins (#390): the same soloPays the slip quotes, so the two never disagree.
export function OutcomeRow({
  label,
  probability,
  series = null,
  state,
  result = null,
  pays,
  slipPick,
  addAction,
  removeAction,
  disabledReasonId,
}: {
  label: string
  probability: number | null
  // A multiple-choice outcome's chart colour, as a key beside its name. A two-outcome chart draws
  // one line, so its rows need none.
  series?: Series | null
  state: OutcomeRowState
  // On a resolved market: the winner is marked, the rest muted at their final chance.
  result?: 'won' | 'lost' | null
  // What EXAMPLE_STAKE on this outcome pays now, or null when it takes no bets.
  pays: number | null
  slipPick: SlipPick
  addAction: (formData: FormData) => ToastActionResult | Promise<ToastActionResult>
  removeAction: (formData: FormData) => ToastActionResult | Promise<ToastActionResult>
  disabledReasonId?: string
}) {
  const percent = Math.round((probability ?? 0) * 100)
  const inSlip = useInSlip(slipPick.outcomeId)

  return (
    <div className={cn('flex items-center gap-3 py-3', result === 'lost' && 'text-ink2')}>
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          {series !== null && <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', SERIES_BG[series])} />}
          <span className={cn(rowTitleClass, 'min-w-0 wrap-break-word')}>{label}</span>
          {result === 'won' && <StatusChip tone="won">Won</StatusChip>}
        </span>
        {state !== 'none' &&
          (inSlip ? (
            <span className="flex items-center gap-1 text-sm font-bold text-acc-text">
              <Check aria-hidden="true" className="size-4 shrink-0" />
              In your slip
            </span>
          ) : (
            pays !== null && (
              <span className="text-sm text-ink2">
                <AnimatedText plainText={`${formatDcAmount(EXAMPLE_STAKE)} wins ${formatDc(pays)}`}>
                  {formatDcAmount(EXAMPLE_STAKE)} wins <AnimatedNumber value={pays} locales="en-US" />
                </AnimatedText>
              </span>
            )
          ))}
      </div>
      <span className={cn(figureInlineClass, 'min-w-14 shrink-0 text-right tabular-nums')}>
        <AnimatedText plainText={`${percent}%`}>
          <AnimatedNumber value={percent} locales="en-US" suffix="%" />
        </AnimatedText>
      </span>
      {state !== 'none' && (
        <div className="shrink-0">
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
