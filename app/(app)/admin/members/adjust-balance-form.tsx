'use client'

import { useActionState, useRef, useState } from 'react'
import { adjustBalanceAction, type ActionState } from '@/lib/members/adjust-balance'
import type { MemberSummary } from '@/lib/members/list-members'
import { ConfirmSubmitDialog, useConfirmSubmit } from '@/components/ui/confirm-submit-dialog'
import { Field, Input } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { toast } from 'sonner'
import { haptics } from '@/lib/haptics'
import { MemberIdentity } from './member-identity'

export function AdjustBalanceForm({ member, now }: { member: MemberSummary; now: number }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const confirm = useConfirmSubmit()
  // Kept until an adjustment succeeds, so a retry after a lost response never adjusts twice (#61).
  const attemptKey = useRef<string | null>(null)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    attemptKey.current ??= crypto.randomUUID()
    formData.set('idempotency_key', attemptKey.current)
    let next: ActionState
    try {
      next = await adjustBalanceAction(member.id, prev, formData)
    } catch {
      confirm.setOpen(false)
      return { formError: 'We couldn’t confirm the adjustment. Check your connection and try again. It won’t be applied twice.' }
    }
    confirm.setOpen(false)
    if (!next?.formError) {
      attemptKey.current = null
      setAmount('')
      setReason('')
      toast.success('Balance adjusted.')
      haptics.success()
    }
    return next
  }, undefined)
  const change = Number(amount)
  // Only an adjustment the server would accept needs confirming; anything else just gets its error back.
  const confirmable = Number.isInteger(change) && change !== 0 && reason.trim() !== ''
  const formId = `adjust-${member.id}-form`
  const amountId = `adjust-${member.id}-amount`
  const reasonId = `adjust-${member.id}-reason`
  const errorId = `adjust-${member.id}-error`

  return (
    <>
      <form
        id={formId}
        action={formAction}
        onSubmit={(e) => {
          if (confirmable) confirm.onSubmit(e)
        }}
        className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4 lg:flex-col lg:items-stretch lg:gap-3"
      >
        <MemberIdentity member={member} now={now} />
        <div className="flex min-w-0 grow flex-col gap-3 md:flex-row md:items-end md:gap-2 lg:flex-col lg:items-stretch lg:gap-3">
          <div className="flex min-w-0 grow items-end gap-2">
            <Field label="Amount" htmlFor={amountId} className="w-[108px] shrink-0 md:w-[150px] lg:w-[108px]">
              <Input
                id={amountId}
                name="amount"
                type="number"
                step="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="+/−"
                aria-invalid={state?.field === 'amount'}
                aria-describedby={state?.field === 'amount' ? errorId : undefined}
              />
            </Field>
            <Field label="Reason" htmlFor={reasonId} className="grow">
              <Input
                id={reasonId}
                name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={TEXT_LIMITS.adjustReason}
                aria-invalid={state?.field === 'reason'}
                aria-describedby={state?.field === 'reason' ? errorId : undefined}
              />
            </Field>
          </div>
          <FormSubmitButton block className="md:w-auto lg:w-full">
            Adjust{' '}
            <span className="sr-only">{member.displayName}</span>
          </FormSubmitButton>
        </div>
      </form>
      <ConfirmSubmitDialog
        formId={formId}
        open={confirm.open}
        onOpenChange={confirm.setOpen}
        pending={isPending}
        title={`Adjust ${member.displayName}’s balance?`}
        description={`${change > 0 ? `Adds ${change} DC to` : `Takes ${Math.abs(change)} DC from`} ${member.displayName}’s balance of ${member.balance} DC, straight away.`}
        confirmLabel="Adjust balance"
      />
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
    </>
  )
}
