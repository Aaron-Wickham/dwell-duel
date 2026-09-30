'use client'

import { useActionState, useState } from 'react'
import { approveTaskCompletionAction, rejectTaskCompletionAction, type ActionState } from '@/lib/tasks/review-task-completion'
import { Input } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { withSuccessToast } from '@/lib/toast/with-success-toast'

export function ReviewButtons({
  completionId,
  submitterName,
  taskTitle,
}: {
  completionId: string
  submitterName: string
  taskTitle: string
}) {
  const hasError = (s: ActionState) => Boolean(s?.formError)
  const boundApprove = withSuccessToast(
    approveTaskCompletionAction.bind(null, completionId),
    hasError,
    'Submission approved.',
  )
  // Controlled, so a refused reject keeps the typed reason; cleared once the reject goes through.
  const [reason, setReason] = useState('')
  const boundReject = withSuccessToast(
    async (prev: ActionState, formData: FormData) => {
      const next = await rejectTaskCompletionAction(completionId, prev, formData)
      if (!next?.formError) setReason('')
      return next
    },
    hasError,
    'Submission rejected.',
  )
  const [approveState, approveAction] = useActionState<ActionState, FormData>(boundApprove, undefined)
  const [rejectState, rejectAction] = useActionState<ActionState, FormData>(boundReject, undefined)
  const reasonId = `reject-reason-${completionId}`
  const approveErrorId = `approve-${completionId}-error`
  const rejectErrorId = `reject-${completionId}-error`

  return (
    <div className="flex flex-col gap-2 md:pl-[52px]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <form action={approveAction} className="flex">
          <FormSubmitButton
            size="sm"
            className="grow"
            aria-describedby={approveState?.formError ? approveErrorId : undefined}
          >
            Approve <span className="sr-only">{submitterName}’s {taskTitle}</span>
          </FormSubmitButton>
        </form>
        <form action={rejectAction} className="flex flex-col gap-2 md:grow md:flex-row md:items-center">
          <label htmlFor={reasonId} className="sr-only">
            Reason for rejecting (optional)
          </label>
          <Input
            id={reasonId}
            name="reason"
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={TEXT_LIMITS.reviewNote}
            className="min-h-11 md:grow"
            aria-invalid={Boolean(rejectState?.formError)}
            aria-describedby={rejectState?.formError ? rejectErrorId : undefined}
          />
          <FormSubmitButton size="sm" variant="secondary">
            Reject <span className="sr-only">{submitterName}’s {taskTitle}</span>
          </FormSubmitButton>
        </form>
      </div>
      {approveState?.formError && (
        <Message tone="error" id={approveErrorId}>
          {approveState.formError}
        </Message>
      )}
      {rejectState?.formError && (
        <Message tone="error" id={rejectErrorId}>
          {rejectState.formError}
        </Message>
      )}
    </div>
  )
}
