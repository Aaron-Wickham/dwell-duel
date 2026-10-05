'use client'

import { useActionState, useState } from 'react'
import { approveTaskCompletionAction, rejectTaskCompletionAction, type ActionState } from '@/lib/tasks/review-task-completion'
import { Button } from '@/components/ui/button'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { RejectDialog } from './reject-dialog'

// A row's Approve stays a direct button (AGENTS.md); Reject asks for its optional reason in a
// dialog rather than a field on every row (COPY-13).
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
  const [rejecting, setRejecting] = useState(false)
  // Controlled, so a refused reject keeps the typed reason; cleared once the reject goes through.
  const [reason, setReason] = useState('')
  const boundReject = withSuccessToast(
    async (prev: ActionState, formData: FormData) => {
      const next = await rejectTaskCompletionAction(completionId, prev, formData)
      if (!next?.formError) {
        setReason('')
        setRejecting(false)
      }
      return next
    },
    hasError,
    'Submission rejected.',
  )
  const [approveState, approveAction] = useActionState<ActionState, FormData>(boundApprove, undefined)
  const [rejectState, rejectAction, isRejectPending] = useActionState<ActionState, FormData>(boundReject, undefined)
  const approveErrorId = `approve-${completionId}-error`

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-col items-stretch gap-1 lg:flex-row lg:items-center">
        <form action={approveAction} className="flex">
          <FormSubmitButton
            size="sm"
            variant="secondary"
            className="grow"
            aria-describedby={approveState?.formError ? approveErrorId : undefined}
          >
            Approve <span className="sr-only">{submitterName}’s {taskTitle}</span>
          </FormSubmitButton>
        </form>
        <Button size="sm" variant="quiet" onClick={() => setRejecting(true)}>
          Reject<span aria-hidden="true">…</span> <span className="sr-only">{submitterName}’s {taskTitle}</span>
        </Button>
      </div>
      {approveState?.formError && (
        <Message tone="error" id={approveErrorId}>
          {approveState.formError}
        </Message>
      )}
      <RejectDialog
        formId={`reject-${completionId}`}
        open={rejecting}
        onOpenChange={setRejecting}
        pending={isRejectPending}
        title={`Reject ${submitterName}’s ${taskTitle}?`}
        submitLabel="Reject"
        action={rejectAction}
        reason={reason}
        onReasonChange={setReason}
        error={isRejectPending ? undefined : rejectState?.formError}
        reasonInvalid={!isRejectPending && rejectState?.field === 'reason'}
      />
    </div>
  )
}
