'use client'

import { Check, Plus } from 'lucide-react'
import { useSlip } from '@/components/slip/slip-provider'
import { Button } from '@/components/ui/button'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { StatusChip } from '@/components/ui/status-chip'
import { ToastActionForm, type ToastActionResult } from '@/components/ui/toast-action-form'
import type { SlipPick } from '@/lib/parlays/get-slip'
import type { OutcomeRowState } from '@/lib/markets/row-state'

type SlipAction = (formData: FormData) => ToastActionResult | Promise<ToastActionResult>

// Whether a row reads "In your slip" follows the slip itself (SlipProvider), so an add here, a
// remove from the slip panel, and a pick from the same market replacing this one all flip the
// row in the same commit. The server's answer settles it: a `false` result (a no-op, e.g. the
// slip was full) leaves the server's slip unchanged, so the row flips back.
export function OutcomeSlipControl({
  pick,
  state,
  addAction,
  removeAction,
  disabledReasonId,
}: {
  // What this outcome looks like as a new Solo pick, shown in the slip before the server answers.
  pick: SlipPick
  state: Exclude<OutcomeRowState, 'none'>
  addAction: SlipAction
  removeAction: SlipAction
  disabledReasonId?: string
}) {
  const slip = useSlip()
  const inSlip = slip.picks.some((p) => p.outcomeId === pick.outcomeId)
  const label = pick.outcomeLabel
  const addLabel = (
    <>
      <Plus aria-hidden="true" className="size-[18px]" />
      Add to slip <span className="sr-only">{label}</span>
    </>
  )

  if (inSlip) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <StatusChip tone="open">
          <Check aria-hidden="true" className="size-4" />
          In your slip
        </StatusChip>
        <Button variant="quiet" size="sm" onClick={() => slip.setOpen(true)}>
          Open slip
        </Button>
        <ToastActionForm
          action={removeAction}
          successMessage="Removed from your slip."
          optimistic={() => slip.remove(pick.outcomeId)}
        >
          <FormSubmitButton variant="quiet" size="sm">
            Remove <span className="sr-only">{label}</span>
          </FormSubmitButton>
        </ToastActionForm>
      </span>
    )
  }

  if (state === 'disabled') {
    return (
      <Button variant="secondary" size="sm" disabled aria-describedby={disabledReasonId}>
        {addLabel}
      </Button>
    )
  }

  return (
    <ToastActionForm action={addAction} successMessage="Added to your slip." optimistic={() => slip.add(pick)}>
      <FormSubmitButton variant="secondary" size="sm">
        {addLabel}
      </FormSubmitButton>
    </ToastActionForm>
  )
}
