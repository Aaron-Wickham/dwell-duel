'use client'

import { useActionState } from 'react'
import { updateTaskAction, type ActionState } from '@/lib/tasks/update-task'
import type { TaskSummary } from '@/lib/tasks/list-tasks'

export function EditTaskForm({ task }: { task: TaskSummary }) {
  const boundAction = updateTaskAction.bind(null, task.id)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2 text-sm">
      <input name="title" defaultValue={task.title} className="border px-2 py-1" />
      <textarea name="description" defaultValue={task.description ?? ''} className="border px-2 py-1" />
      <input name="reward_amount" type="number" min="1" step="1" defaultValue={task.rewardAmount} className="border px-2 py-1" />
      <label className="flex items-center gap-2">
        <input name="is_active" type="checkbox" defaultChecked={task.isActive} />
        Active
      </label>
      <button type="submit">Save</button>
      {state?.formError && <p className="text-red-600">{state.formError}</p>}
    </form>
  )
}
