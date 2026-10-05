'use client'

import { Plus } from 'lucide-react'
import { useSlip } from '@/components/slip/slip-provider'
import { Button } from '@/components/ui/button'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { ToastActionForm, type ToastActionResult } from '@/components/ui/toast-action-form'
import type { SlipPick } from '@/lib/parlays/get-slip'
import type { OutcomeRowState } from '@/lib/markets/row-state'

type SlipAction = (formData: FormData) => ToastActionResult | Promise<ToastActionResult>

// Whether this outcome is in the slip follows the slip itself (SlipProvider), so an add here, a
// remove from the slip panel, and a pick from the same market replacing this one all flip the
// row in the same commit. The server's answer settles it: a `false` result (a no-op, e.g. the
// slip was full) leaves the server's slip unchanged, so the row flips back.
export function useInSlip(outcomeId: string): boolean {
  return useSlip().picks.some((p) => p.outcomeId === outcomeId)
}

// The row's one button: Add, or Remove once the outcome is in the slip. The row itself says
// "In your slip" (outcome-row.tsx).
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
  const inSlip = useInSlip(pick.outcomeId)
  const label = pick.outcomeLabel
  const addLabel = (
    <>
      <Plus aria-hidden="true" className="size-[18px]" />
      Add <span className="sr-only">{label} to slip</span>
    </>
  )

  if (inSlip) {
    return (
      <ToastActionForm
        action={removeAction}
        successMessage="Removed from your slip."
        optimistic={() => slip.remove(pick.outcomeId)}
      >
        <FormSubmitButton variant="secondary" size="sm">
          Remove <span className="sr-only">{label} from slip</span>
        </FormSubmitButton>
      </ToastActionForm>
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
