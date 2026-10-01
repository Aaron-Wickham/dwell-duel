'use client'

import { MAX_TASK_REWARD } from '@/lib/tasks/limits'
import { useActionState, useState } from 'react'
import { updateTaskAction, type ActionState } from '@/lib/tasks/update-task'
import type { TaskSummary } from '@/lib/tasks/list-tasks'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { keepCheckedOnReset } from '@/lib/forms/keep-on-reset'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { withSuccessToast } from '@/lib/toast/with-success-toast'

export function EditTaskForm({ id, task, onDone }: { id: string; task: TaskSummary; onDone: () => void }) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [reward, setReward] = useState(String(task.rewardAmount))
  const [proofRequired, setProofRequired] = useState(task.proofRequired)
  const [state, formAction] = useActionState<ActionState, FormData>(
    withSuccessToast(
      async (prevState: ActionState, formData: FormData) => {
        const result = await updateTaskAction(task.id, prevState, formData)
        if (!result?.formError) onDone()
        return result
      },
      (s) => Boolean(s?.formError),
      'Task saved.',
    ),
    undefined,
  )
  const errorId = `${id}-error`

  return (
    <form id={id} action={formAction} className="flex flex-col gap-4 rounded-[14px] bg-sunk p-3.5">
      <Field label="Title" htmlFor={`${id}-title`}>
        <Input
          id={`${id}-title`}
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={TEXT_LIMITS.taskTitle}
          aria-invalid={state?.field === 'title'}
          aria-describedby={state?.field === 'title' ? errorId : undefined}
        />
      </Field>
      <Field label="Description" htmlFor={`${id}-description`}>
        <Textarea
          id={`${id}-description`}
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={TEXT_LIMITS.taskDescription}
          aria-invalid={state?.field === 'description'}
          aria-describedby={state?.field === 'description' ? errorId : undefined}
        />
      </Field>
      <Field label="Reward (DC)" htmlFor={`${id}-reward`}>
        <Input
          id={`${id}-reward`}
          name="reward_amount"
          type="number"
          min="1"
          max={MAX_TASK_REWARD}
          step="1"
          value={reward}
          onChange={(e) => setReward(e.target.value)}
          required
          aria-invalid={state?.field === 'reward_amount'}
          aria-describedby={state?.field === 'reward_amount' ? errorId : undefined}
        />
      </Field>
      <label className="pressable inline-flex min-h-11 cursor-pointer items-center gap-2.5 self-start font-bold">
        <input
          name="proof_required"
          type="checkbox"
          checked={proofRequired}
          ref={keepCheckedOnReset(proofRequired)}
          onChange={(e) => setProofRequired(e.target.checked)}
          className="m-0 size-[22px] accent-primary"
        />
        Require proof
      </label>
      {/* Deactivate/Reactivate owns this flag; saving an edit keeps it as it is. */}
      {task.isActive && <input type="hidden" name="is_active" value="on" />}
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
      <div className="flex gap-2">
        <FormSubmitButton size="sm">Save</FormSubmitButton>
        <Button size="sm" variant="quiet" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
