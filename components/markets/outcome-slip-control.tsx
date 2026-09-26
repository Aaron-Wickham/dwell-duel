'use client'

import { useOptimistic } from 'react'
import { Check, Plus } from 'lucide-react'
import { useSlipCount } from '@/components/app-nav/slip-count'
import { useMarketSlip } from '@/components/markets/market-slip'
import { Button } from '@/components/ui/button'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { StatusChip } from '@/components/ui/status-chip'
import { ToastActionForm } from '@/components/ui/toast-action-form'
import type { OutcomeRowState } from '@/lib/markets/row-state'

type SlipAction = (formData: FormData) => void | boolean | Promise<void | boolean>

// Add to parlay and Remove flip the row at once. Which row shows "In your slip" follows the
// market's one pick: on the market page MarketSlipProvider holds it for every row, so adding a
// pick flips the replaced row off in the same commit; a row rendered on its own keeps its own.
// The server's answer settles it: a `false` result (a no-op, e.g. the slip was full) leaves the
// server's state unchanged, so the rows flip back.
export function OutcomeSlipControl({
  outcomeId,
  label,
  state,
  addAction,
  removeAction,
  disabledReasonId,
}: {
  outcomeId: string
  label: string
  state: Exclude<OutcomeRowState, 'none'>
  addAction: SlipAction
  removeAction: SlipAction
  disabledReasonId?: string
}) {
  const [ownPick, setOwnPick] = useOptimistic<string | null>(state === 'inslip' ? outcomeId : null)
  const market = useMarketSlip()
  const pick = market ? market.pick : ownPick
  const choose = market ? market.choose : setOwnPick
  const { adjust } = useSlipCount()
  const shown = pick === outcomeId ? 'inslip' : state === 'inslip' ? 'add' : state
  const addLabel = (
    <>
      <Plus aria-hidden="true" className="size-[18px]" />
      Add to parlay <span className="sr-only">{label}</span>
    </>
  )

  if (shown === 'inslip') {
    return (
      <span className="flex items-center gap-2">
        <StatusChip tone="open">
          <Check aria-hidden="true" className="size-4" />
          In your slip
        </StatusChip>
        <ToastActionForm
          action={removeAction}
          successMessage="Removed from your slip."
          optimistic={() => {
            choose(null)
            adjust(-1)
          }}
        >
          <FormSubmitButton variant="quiet" size="sm">
            Remove <span className="sr-only">{label}</span>
          </FormSubmitButton>
        </ToastActionForm>
      </span>
    )
  }

  if (shown === 'add') {
    return (
      <ToastActionForm
        action={addAction}
        successMessage="Added to your slip."
        optimistic={() => {
          // A new pick replaces the market's current one, so the count only grows when there was none.
          if (pick === null) adjust(1)
          choose(outcomeId)
        }}
      >
        <FormSubmitButton variant="secondary" size="sm">
          {addLabel}
        </FormSubmitButton>
      </ToastActionForm>
    )
  }

  return (
    <Button variant="secondary" size="sm" disabled aria-describedby={disabledReasonId}>
      {addLabel}
    </Button>
  )
}
