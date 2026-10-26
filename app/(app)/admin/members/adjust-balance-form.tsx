'use client'

import { useActionState, useState } from 'react'
import { fingerprintOf, useAttemptKey } from '@/lib/forms/attempt-key'
import { adjustBalanceAction, type ActionState } from '@/lib/members/adjust-balance'
import type { MemberSummary } from '@/lib/members/list-members'
import { ConfirmSubmitDialog, useConfirmSubmit } from '@/components/ui/confirm-submit-dialog'
import { Field, Input } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { toast } from 'sonner'
import { haptics } from '@/lib/haptics'
import { formatDcAmount, formatSignedDcAmount } from '@/lib/format/dc'

// Owner only: the page leaves it out for anyone else, and adjust_balance refuses anyway.
export function AdjustBalanceForm({ member }: { member: MemberSummary }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const confirm = useConfirmSubmit()
  // Kept until an adjustment succeeds, so a retry after a lost response never adjusts twice (#61).
  // Editing the amount or reason starts a new attempt, so a corrected figure isn't swallowed as a
  // replay of the first one (#267).
  const attemptKey = useAttemptKey()
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    formData.set('idempotency_key', attemptKey.claim(fingerprintOf(formData)))
    let next: ActionState
    try {
      next = await adjustBalanceAction(member.id, prev, formData)
    } catch {
      confirm.setOpen(false)
      return { formError: 'We couldn’t confirm the adjustment. Check your connection and try again. It won’t be applied twice.' }
    }
    confirm.setOpen(false)
    if (!next?.formError) {
      attemptKey.release()
      const applied = Number(formData.get('amount'))
      setAmount('')
      setReason('')
      toast.success(`Balance adjusted by ${formatSignedDcAmount(applied)}.`)
      haptics.success()
    }
    return next
  }, undefined)
  const change = Number(amount)
  const after = member.balance + change
  // Only an adjustment the server would accept needs confirming; anything else just gets its error back.
  const confirmable = Number.isInteger(change) && change !== 0 && reason.trim() !== '' && after >= 0
  const formId = `adjust-${member.id}-form`
  const amountId = `adjust-${member.id}-amount`
  const reasonId = `adjust-${member.id}-reason`
  const amountHintId = `${amountId}-hint`
  const errorId = `adjust-${member.id}-error`

  return (
    <>
      <form
        id={formId}
        action={formAction}
        onSubmit={(e) => {
          if (confirmable) confirm.onSubmit(e)
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex min-w-0 items-end gap-2">
          <Field label="Amount" htmlFor={amountId} className="w-[108px] shrink-0 md:w-[150px]">
            <Input
              id={amountId}
              name="amount"
              type="number"
              step="1"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={state?.field === 'amount'}
              aria-describedby={state?.field === 'amount' ? `${amountHintId} ${errorId}` : amountHintId}
            />
          </Field>
          <Field label="Reason" htmlFor={reasonId} className="grow">
            <Input
              id={reasonId}
              name="reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={TEXT_LIMITS.adjustReason}
              aria-invalid={state?.field === 'reason'}
              aria-describedby={state?.field === 'reason' ? errorId : undefined}
            />
          </Field>
        </div>
        {/* Under both fields rather than in the narrow Amount column, where it would push that
            field's label out of line with Reason's. */}
        <p id={amountHintId} className="-mt-1 text-sm text-ink2">
          Use a minus to take coins away, like -50.
        </p>
        <FormSubmitButton block>
          Adjust balance <span className="sr-only">for {member.displayName}</span>
        </FormSubmitButton>
      </form>
      <ConfirmSubmitDialog
        formId={formId}
        open={confirm.open}
        onOpenChange={confirm.setOpen}
        pending={isPending}
        title={`Adjust ${member.displayName}’s balance?`}
        // The balance it ends at, so an extra zero shows before it's applied, and the reason the
        // ledger will show.
        description={`${member.displayName}’s balance goes from ${formatDcAmount(member.balance)} to ${formatDcAmount(after)} (${formatSignedDcAmount(change)}), straight away. Reason: “${reason.trim()}”.`}
        confirmLabel="Adjust balance"
        pendingLabel="Adjusting…"
      />
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
    </>
  )
}
