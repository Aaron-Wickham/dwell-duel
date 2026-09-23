'use client'

import { useActionState, useState } from 'react'
import { createTaskAction, type ActionState } from '@/lib/tasks/create-task'

export function CreateTaskForm() {
  const [isRepeatable, setIsRepeatable] = useState(false)
  const [state, formAction] = useActionState<ActionState, FormData>(createTaskAction, undefined)

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-2 border p-4">
      <label className="flex flex-col gap-1">
        Title
        <input name="title" required className="border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        Description
        <textarea name="description" className="border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        Reward (DC)
        <input name="reward_amount" type="number" min="1" step="1" required className="border px-2 py-1" />
      </label>
      <label className="flex items-center gap-2">
        <input
          name="is_repeatable"
          type="checkbox"
          checked={isRepeatable}
          onChange={(e) => setIsRepeatable(e.target.checked)}
        />
        Repeatable
      </label>
      {isRepeatable && (
        <label className="flex flex-col gap-1">
          Cadence
          <select name="period" required className="border px-2 py-1">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
      )}
      <button type="submit">Create task</button>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
