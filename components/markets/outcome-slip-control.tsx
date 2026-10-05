'use client'

import { useLayoutEffect, useRef, type MouseEvent } from 'react'
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

// The outcome whose Add or Remove a member just pressed with focus on it, so the control that
// replaces it takes focus back (A11Y-02): if the swap or the server's refresh remounts the row,
// focus would otherwise fall to <body> and the next Tab start from the top of the page.
let refocus: { outcomeId: string; until: number } | null = null
const REFOCUS_MS = 5000

function useKeepFocus(outcomeId: string) {
  const ref = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    if (refocus?.outcomeId !== outcomeId) return
    const active = document.activeElement
    if (Date.now() > refocus.until || (active !== null && active !== document.body && active !== ref.current)) {
      refocus = null
      return
    }
    if (active !== ref.current) ref.current?.focus()
  })
  function mark(event: MouseEvent<HTMLButtonElement>) {
    if (document.activeElement === event.currentTarget) refocus = { outcomeId, until: Date.now() + REFOCUS_MS }
  }
  return { ref, mark }
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
  const { ref: focusRef, mark: markFocus } = useKeepFocus(pick.outcomeId)
  const label = pick.outcomeLabel
  const addLabel = (
    <>
      <Plus aria-hidden="true" className="size-[18px]" />
      Add <span className="sr-only">{label} to slip</span>
    </>
  )

  if (inSlip) {
    return (
      <ToastActionForm action={removeAction} optimistic={() => slip.remove(pick.outcomeId)}>
        <FormSubmitButton ref={focusRef} onClick={markFocus} variant="secondary" size="sm">
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
    // No toast on add or remove: the row's "In your slip" and the slip button say it (#392).
    <ToastActionForm action={addAction} optimistic={() => slip.add(pick)}>
      <FormSubmitButton ref={focusRef} onClick={markFocus} variant="secondary" size="sm">
        {addLabel}
      </FormSubmitButton>
    </ToastActionForm>
  )
}
