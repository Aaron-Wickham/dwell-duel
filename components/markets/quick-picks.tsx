'use client'

import { Check, Plus } from 'lucide-react'
import { useSlipPicks } from '@/components/slip/slip-provider'
import { useInSlip } from '@/components/markets/outcome-slip-control'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { ToastActionForm, type ToastActionResult } from '@/components/ui/toast-action-form'
import { SERIES_BG } from '@/components/markets/series-classes'
import { chipTextClass, uiTextClass } from '@/components/ui/page'
import type { SlipPick } from '@/lib/parlays/get-slip'
import type { Series } from '@/lib/markets/outcome-series'
import { cn } from '@/lib/utils'

type SlipAction = (formData: FormData) => ToastActionResult | Promise<ToastActionResult>

export interface QuickPick {
  pick: SlipPick
  pct: number
  // A multiple-choice outcome's chart colour, for its dot; null on a two-outcome market.
  series: Series | null
  addAction: SlipAction
  removeAction: SlipAction
}

// One outcome's button on a market card (#439). It's one button that adds the pick, then removes
// it, so focus stays on it after the press rather than falling to a replacement. A row (a
// multiple-choice outcome) ends in an Add pill that says what a tap does; under a mouse the row
// takes a ring and the pill fills, so it reads as a button rather than as part of the card. Both
// sides of a two-outcome market look the same (D-3): red is a lost bet, and the word says which
// side. Its name stays the same when pressed, outcome, chance and market, and aria-pressed says
// whether it's in the slip; while the add runs it keeps its in-slip look rather than greying out.
function QuickPickButton({
  pick,
  pct,
  series,
  addAction,
  removeAction,
  row,
  disabledReasonId,
}: QuickPick & { row: boolean; disabledReasonId?: string }) {
  const slip = useSlipPicks()
  const inSlip = useInSlip(pick.outcomeId)
  const label = pick.outcomeLabel
  // A full slip can still remove a pick it holds.
  const disabled = disabledReasonId !== undefined && !inSlip
  return (
    <ToastActionForm
      action={inSlip ? removeAction : addAction}
      optimistic={() => (inSlip ? slip.remove(pick.outcomeId) : slip.add(pick))}
      className={row ? undefined : 'flex-1'}
    >
      <FormSubmitButton
        variant="secondary"
        size="sm"
        quietPending
        disabled={disabled}
        aria-describedby={disabled ? disabledReasonId : undefined}
        aria-pressed={inSlip}
        aria-label={`${label}, ${pct}%, ${pick.marketTitle}`}
        className={cn(
          `group w-full border-0 ${uiTextClass} font-extrabold no-underline hover:ring-2 disabled:hover:ring-0`,
          row ? 'justify-between gap-3 pr-2 pl-3' : 'justify-center',
          inSlip ? 'bg-nav-active text-on-nav-active hover:bg-nav-active hover:ring-line-s' : 'bg-sunk text-ink hover:bg-sunk hover:ring-line-s',
        )}
      >
        {row ? (
          <>
            <span className="flex min-w-0 items-center gap-2">
              {series !== null && <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', SERIES_BG[series])} />}
              <span className="truncate">{label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {pct}%
              <span
                aria-hidden="true"
                className={cn(
                  `flex items-center gap-1 rounded-full border px-2.5 py-1 ${chipTextClass}`,
                  inSlip
                    ? 'border-current'
                    : disabled
                      ? 'border-line-s'
                      : 'border-line-s group-hover:border-nav-active group-hover:bg-nav-active group-hover:text-on-nav-active',
                )}
              >
                {inSlip ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                {inSlip ? 'In slip' : 'Add'}
              </span>
            </span>
          </>
        ) : (
          <>
            {inSlip ? <Check aria-hidden="true" className="size-4 shrink-0" /> : <Plus aria-hidden="true" className="size-4 shrink-0" />}
            {/* The chance is what's being chosen on, so only the label gives way. */}
            <span className="min-w-0 truncate">{label}</span>
            <span className="shrink-0">{pct}%</span>
          </>
        )}
      </FormSubmitButton>
    </ToastActionForm>
  )
}

// Add to the slip without opening the market (#439): a two-outcome market's two picks side by
// side, or every outcome of a multiple-choice market as a row, likeliest first. It sits above the
// card's stretched link, so a tap here adds rather than opens, and `data-own-hover` keeps the card
// from lifting while the pointer is on a pick.
// `disabledReasonId` names the note saying why a pick can't be added (a full slip).
export function QuickPicks({ picks, disabledReasonId, className }: { picks: QuickPick[]; disabledReasonId?: string; className?: string }) {
  const rows = picks.some((p) => p.series !== null)
  return (
    <div data-own-hover className={cn('relative z-[1]', rows ? 'flex flex-col gap-1.5' : 'flex gap-2', className)}>
      {picks.map((p) => (
        <QuickPickButton key={p.pick.outcomeId} {...p} row={rows} disabledReasonId={disabledReasonId} />
      ))}
    </div>
  )
}
