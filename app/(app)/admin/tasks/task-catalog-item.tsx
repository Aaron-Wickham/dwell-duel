'use client'

import { useActionState, useState } from 'react'
import { updateTaskAction, type ActionState } from '@/lib/tasks/update-task'
import type { TaskSummary } from '@/lib/tasks/list-tasks'
import { PERIOD_LABEL } from '@/lib/tasks/period-label'
import { Button } from '@/components/ui/button'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { cn } from '@/lib/utils'
import { EditTaskForm } from './edit-task-form'

const pillClass = 'inline-flex h-6 items-center whitespace-nowrap rounded-full px-[9px] text-xs font-extrabold'

export function TaskCatalogItem({ task }: { task: TaskSummary }) {
  const [editing, setEditing] = useState(false)
  const boundUpdate = updateTaskAction.bind(null, task.id)
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(boundUpdate, undefined)
  const editFormId = `edit-task-${task.id}`
  const toggleErrorId = `toggle-${task.id}-error`

  return (
    <li className="flex flex-col gap-2 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className={cn('font-extrabold', !task.isActive && 'text-ink2')}>
          {task.title} — {task.rewardAmount} DC
        </p>
        <span className="flex shrink-0 gap-1.5">
          {task.isRepeatable && task.period && <span className={cn(pillClass, 'bg-sunk text-ink2')}>{PERIOD_LABEL[task.period]}</span>}
          {!task.isActive && <span className={cn(pillClass, 'bg-gold-soft text-gold')}>Inactive</span>}
        </span>
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          aria-expanded={editing}
          aria-controls={editing ? editFormId : undefined}
          onClick={() => setEditing(!editing)}
        >
          Edit{' '}
          <span className="sr-only">{task.title}</span>
        </Button>
        {/* updateTaskAction saves every field, so the toggle resends the current ones unchanged. */}
        <form action={toggleAction}>
          <input type="hidden" name="title" value={task.title} />
          <input type="hidden" name="description" value={task.description ?? ''} />
          <input type="hidden" name="reward_amount" value={task.rewardAmount} />
          {!task.isActive && <input type="hidden" name="is_active" value="on" />}
          <FormSubmitButton
            variant={task.isActive ? 'quiet' : 'secondary'}
            size="sm"
            aria-describedby={toggleState?.formError ? toggleErrorId : undefined}
          >
            {task.isActive ? 'Deactivate' : 'Reactivate'}{' '}
            <span className="sr-only">{task.title}</span>
          </FormSubmitButton>
        </form>
      </div>
      {toggleState?.formError && (
        <Message tone="error" id={toggleErrorId}>
          {toggleState.formError}
        </Message>
      )}
      {editing && <EditTaskForm id={editFormId} task={task} onDone={() => setEditing(false)} />}
    </li>
  )
}
