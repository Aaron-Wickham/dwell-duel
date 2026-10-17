'use client'

import { Check, Plus } from 'lucide-react'
import { useSlip } from '@/components/slip/slip-provider'
import { useInSlip } from '@/components/markets/outcome-slip-control'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { ToastActionForm, type ToastActionResult } from '@/components/ui/toast-action-form'
import { SERIES_BG } from '@/components/markets/series-classes'
import { uiTextClass } from '@/components/ui/page'
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
// it, so focus stays on it after the press rather than falling to a replacement.
function QuickPickButton({ pick, pct, series, tone, addAction, removeAction, row }: QuickPick & { row: boolean }) {
  const slip = useSlip()
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
          `w-full border-0 ${uiTextClass} font-extrabold no-underline`,
          row ? 'justify-between px-3' : 'justify-center',
          inSlip
            ? 'bg-nav-active text-on-nav-active hover:bg-nav-active'
            : tone === 'yes'
              ? 'bg-acc-soft text-acc-text hover:bg-acc-soft'
              : tone === 'no'
                ? 'bg-loss-soft text-loss hover:bg-loss-soft'
                : 'bg-sunk text-ink hover:bg-sunk',
        )}
      >
        {row ? (
          <>
            <span className="flex min-w-0 items-center gap-2">
              {series !== null && <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', SERIES_BG[series])} />}
              <span className="truncate">{label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {pct}%
              {inSlip ? <Check aria-hidden="true" className="size-4" /> : <Plus aria-hidden="true" className="size-4" />}
            </span>
          </>
        ) : (
          <>
            <span className="truncate">
              {label} {pct}%
            </span>
            {inSlip && <Check aria-hidden="true" className="size-4 shrink-0" />}
          </>
        )}
      </FormSubmitButton>
    </ToastActionForm>
  )
}

// Add to the slip without opening the market (#439): a two-outcome market's two picks side by
// side, or a multiple-choice market's two favourites as rows and how many more it has. It sits
// above the card's stretched link, so a tap here adds rather than opens.
export function QuickPicks({ picks, more }: { picks: QuickPick[]; more: number }) {
  const rows = picks.some((p) => p.tone === null)
  return (
    <div className="relative z-[1] flex flex-col gap-1.5">
      <div className={rows ? 'flex flex-col gap-1.5' : 'flex gap-2'}>
        {picks.map((p) => (
          <QuickPickButton key={p.pick.outcomeId} {...p} row={rows} />
        ))}
      </div>
      {more > 0 && <p className="text-sm font-bold text-ink2">+{more} more</p>}
    </div>
  )
}
