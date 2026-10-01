'use client'

import { MAX_TASK_REWARD } from '@/lib/tasks/limits'
import { useActionState, useState } from 'react'
import { fingerprintOf, useAttemptKey } from '@/lib/forms/attempt-key'
import { createTaskAction, type ActionState } from '@/lib/tasks/create-task'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { keepCheckedOnReset } from '@/lib/forms/keep-on-reset'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { withSuccessToast } from '@/lib/toast/with-success-toast'

export function CreateTaskForm() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [reward, setReward] = useState('')
  const [proofRequired, setProofRequired] = useState(false)
  const [isRepeatable, setIsRepeatable] = useState(false)
  const [period, setPeriod] = useState('daily')
  const attemptKey = useAttemptKey()
  const [state, formAction] = useActionState<ActionState, FormData>(
    withSuccessToast(
      async (prev: ActionState, formData: FormData) => {
        formData.set('idempotency_key', attemptKey.claim(fingerprintOf(formData)))
        const next = await createTaskAction(prev, formData)
        // A created task starts the form afresh, ready for the next one.
        if (!next?.formError) {
          attemptKey.release()
          setTitle('')
          setDescription('')
          setReward('')
          setProofRequired(false)
          setIsRepeatable(false)
          setPeriod('daily')
        }
        return next
      },
      (s) => Boolean(s?.formError),
      'Task created.',
    ),
    undefined,
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Title" htmlFor="create-task-title">
        <Input
          id="create-task-title"
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TEXT_LIMITS.taskTitle}
          aria-invalid={state?.field === 'title'}
          aria-describedby={state?.field === 'title' ? 'create-task-error' : undefined}
        />
      </Field>
      <Field label="Description" htmlFor="create-task-description">
        <Textarea
          id="create-task-description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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
          max={MAX_TASK_REWARD}
          step="1"
          required
          value={reward}
          onChange={(e) => setReward(e.target.value)}
          aria-invalid={state?.field === 'reward_amount'}
          aria-describedby={state?.field === 'reward_amount' ? 'create-task-error' : undefined}
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
      <label className="pressable inline-flex min-h-11 cursor-pointer items-center gap-2.5 self-start font-bold">
        <input
          name="is_repeatable"
          type="checkbox"
          checked={isRepeatable}
          ref={keepCheckedOnReset(isRepeatable)}
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
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
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
