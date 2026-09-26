'use client'

import { useActionState, useOptimistic } from 'react'
import { PendingReviewChip } from '@/components/tasks/task-row'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { submitTaskCompletionAction, type ActionState } from '@/lib/tasks/submit-task-completion'

export function SubmitButton({ taskId }: { taskId: string }) {
  const [submitting, setSubmitting] = useOptimistic(false)
  const [state, formAction] = useActionState<ActionState, FormData>(
    withSuccessToast(
      async (prev: ActionState, formData: FormData) => {
        setSubmitting(true)
        return submitTaskCompletionAction(taskId, prev, formData)
      },
      (s) => Boolean(s?.formError),
      'Submitted for review.',
    ),
    undefined,
  )
  const errorId = `submit-error-${taskId}`

  // TaskRow renders this button only while the task is available. Once the server has the
  // submission, the row shows its own chip and drops this component in the same render that
  // ends `submitting`, so a task never shows two "Pending review" chips.
  if (submitting) return <PendingReviewChip />

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <FormSubmitButton size="sm" aria-describedby={state?.formError ? errorId : undefined}>
        I did this
      </FormSubmitButton>
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
    </form>
  )
}
