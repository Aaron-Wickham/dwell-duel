'use client'

import { useActionState } from 'react'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { submitTaskCompletionAction, type ActionState } from '@/lib/tasks/submit-task-completion'

export function SubmitButton({ taskId }: { taskId: string }) {
  const boundAction = withSuccessToast(
    submitTaskCompletionAction.bind(null, taskId),
    (s) => Boolean(s?.formError),
    'Submitted for review.',
  )
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)
  const errorId = `submit-error-${taskId}`

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
