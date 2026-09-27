'use client'

import { useActionState, useState } from 'react'
import { createTaskAction, type ActionState } from '@/lib/tasks/create-task'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'

export function CreateTaskForm() {
  const [isRepeatable, setIsRepeatable] = useState(false)
  const [state, formAction] = useActionState<ActionState, FormData>(createTaskAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Title" htmlFor="create-task-title">
        <Input
          id="create-task-title"
          name="title"
          required
          maxLength={TEXT_LIMITS.taskTitle}
          aria-invalid={state?.field === 'title'}
          aria-describedby={state?.field === 'title' ? 'create-task-error' : undefined}
        />
      </Field>
      <Field label="Description" htmlFor="create-task-description">
        <Textarea
          id="create-task-description"
          name="description"
          maxLength={TEXT_LIMITS.taskDescription}
          aria-invalid={state?.field === 'description'}
          aria-describedby={state?.field === 'description' ? 'create-task-error' : undefined}
        />
      </Field>
      <Field label="Reward (DC)" htmlFor="create-task-reward">
        <Input
          id="create-task-reward"
          name="reward_amount"
          type="number"
          min="1"
          step="1"
          required
          aria-invalid={state?.field === 'reward_amount'}
          aria-describedby={state?.field === 'reward_amount' ? 'create-task-error' : undefined}
        />
      </Field>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 self-start font-bold">
        <input
          name="is_repeatable"
          type="checkbox"
          checked={isRepeatable}
          onChange={(e) => setIsRepeatable(e.target.checked)}
          className="m-0 size-[22px] accent-primary"
        />
        Repeatable
      </label>
      {isRepeatable && (
        <Field label="Cadence" htmlFor="create-task-period">
          <Select
            id="create-task-period"
            name="period"
            required
            aria-invalid={state?.field === 'period'}
            aria-describedby={state?.field === 'period' ? 'create-task-error' : undefined}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </Field>
      )}
      {state?.formError && (
        <Message tone="error" id="create-task-error">
          {state.formError}
        </Message>
      )}
      <FormSubmitButton block className="md:w-auto md:self-start">
        Create task
      </FormSubmitButton>
    </form>
  )
}
