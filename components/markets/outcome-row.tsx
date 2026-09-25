import { Check, Plus, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { StatusChip } from '@/components/ui/status-chip'
import type { Series } from '@/lib/markets/outcome-series'
import { formatOdds } from '@/lib/parlays/odds'
import { cn } from '@/lib/utils'

export type OutcomeRowState = 'add' | 'inslip' | 'disabled' | 'none'

const SERIES_BG: Record<Series, string> = {
  1: 'bg-s1',
  2: 'bg-s2',
  3: 'bg-s3',
  4: 'bg-s4',
  5: 'bg-s5',
  6: 'bg-s6',
}

export function OutcomeRow({
  label,
  poolTotal,
  probability,
  oddsBp,
  series,
  state,
  winner = false,
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
  addAction: (formData: FormData) => void | Promise<void>
  removeAction: (formData: FormData) => void | Promise<void>
  disabledReasonId?: string
}) {
  const percent = (probability ?? 0) * 100
  const addLabel = (
    <>
      <Plus aria-hidden="true" className="size-[18px]" />
      Add to parlay <span className="sr-only">{label}</span>
    </>
  )

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
          {Math.round(percent)}% ({poolTotal} DC)
        </span>
      </div>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-sunk">
        <span className={cn('block h-full rounded-full', SERIES_BG[series])} style={{ width: `${percent}%` }} />
      </div>
      {state !== 'none' && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-ink2">{oddsBp !== null && `${formatOdds(oddsBp)}× payout per DC`}</span>
          {state === 'inslip' && (
            <span className="flex items-center gap-2">
              <StatusChip tone="open">
                <Check aria-hidden="true" className="size-4" />
                In your slip
              </StatusChip>
              <form action={removeAction}>
                <FormSubmitButton variant="quiet" size="sm">
                  Remove <span className="sr-only">{label}</span>
                </FormSubmitButton>
              </form>
            </span>
          )}
          {state === 'add' && (
            <form action={addAction}>
              <FormSubmitButton variant="secondary" size="sm">
                {addLabel}
              </FormSubmitButton>
            </form>
          )}
          {state === 'disabled' && (
            <Button variant="secondary" size="sm" disabled aria-describedby={disabledReasonId}>
              {addLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
