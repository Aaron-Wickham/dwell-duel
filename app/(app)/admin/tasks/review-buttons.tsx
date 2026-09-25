'use client'

import { useActionState } from 'react'
import { approveTaskCompletionAction, rejectTaskCompletionAction, type ActionState } from '@/lib/tasks/review-task-completion'
import { Input } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'

export function ReviewButtons({ completionId }: { completionId: string }) {
  const boundApprove = approveTaskCompletionAction.bind(null, completionId)
  const boundReject = rejectTaskCompletionAction.bind(null, completionId)
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
            Approve
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
            className="min-h-11 md:grow"
            aria-invalid={Boolean(rejectState?.formError)}
            aria-describedby={rejectState?.formError ? rejectErrorId : undefined}
          />
          <FormSubmitButton size="sm" variant="secondary">
            Reject
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
