'use client'

import { useActionState } from 'react'
import { submitTaskCompletionAction, type ActionState } from '@/lib/tasks/submit-task-completion'

export function SubmitButton({ taskId }: { taskId: string }) {
  const boundAction = submitTaskCompletionAction.bind(null, taskId)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction}>
      <button type="submit" className="text-sm underline">
        I did this
      </button>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
