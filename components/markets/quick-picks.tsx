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
  // Yes or Over (green), No or Under (red); null for a multiple-choice outcome.
  tone: 'yes' | 'no' | null
  addAction: SlipAction
  removeAction: SlipAction
}

// One outcome's button on a market card (#439). It's one button that adds the pick, then removes
// it, so focus stays on it after the press rather than falling to a replacement. A row (a
// multiple-choice outcome) ends in an Add pill that says what a tap does; under a mouse the row
// takes a ring and the pill fills, so it reads as a button rather than as part of the card.
function QuickPickButton({ pick, pct, series, tone, addAction, removeAction, row }: QuickPick & { row: boolean }) {
  const slip = useSlipPicks()
  const inSlip = useInSlip(pick.outcomeId)
  const label = pick.outcomeLabel
  return (
    <ToastActionForm
      action={inSlip ? removeAction : addAction}
      optimistic={() => (inSlip ? slip.remove(pick.outcomeId) : slip.add(pick))}
      className={row ? undefined : 'flex-1'}
    >
      <FormSubmitButton
        variant="secondary"
        size="sm"
        aria-pressed={inSlip}
        aria-label={inSlip ? `Remove ${label} from slip` : `Add ${label} at ${pct}% to slip`}
        className={cn(
          `group w-full border-0 ${uiTextClass} font-extrabold no-underline hover:ring-2`,
          row ? 'justify-between gap-3 pr-2 pl-3' : 'justify-center',
          inSlip
            ? 'bg-nav-active text-on-nav-active hover:bg-nav-active hover:ring-line-s'
            : tone === 'yes'
              ? 'bg-acc-soft text-acc-text hover:bg-acc-soft hover:ring-acc-text'
              : tone === 'no'
                ? 'bg-loss-soft text-loss hover:bg-loss-soft hover:ring-loss'
                : 'bg-sunk text-ink hover:bg-sunk hover:ring-line-s',
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
            <span className="truncate">
              {label} {pct}%
            </span>
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
export function QuickPicks({ picks }: { picks: QuickPick[] }) {
  const rows = picks.some((p) => p.tone === null)
  return (
    <div data-own-hover className={cn('relative z-[1]', rows ? 'flex flex-col gap-1.5' : 'flex gap-2')}>
      {picks.map((p) => (
        <QuickPickButton key={p.pick.outcomeId} {...p} row={rows} />
      ))}
    </div>
  )
}
