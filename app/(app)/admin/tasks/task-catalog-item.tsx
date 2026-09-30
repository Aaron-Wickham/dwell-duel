'use client'

import { useActionState, useRef, useState } from 'react'
import { updateTaskAction, type ActionState } from '@/lib/tasks/update-task'
import type { TaskSummary } from '@/lib/tasks/list-tasks'
import { PERIOD_LABEL } from '@/lib/tasks/period-label'
import { Button } from '@/components/ui/button'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { StatusChip } from '@/components/ui/status-chip'
import { cn } from '@/lib/utils'
import { ConfirmActionButton } from '@/components/ui/confirm-action-button'
import { deleteTaskAction } from '@/lib/admin/owner-actions'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { EditTaskForm } from './edit-task-form'

// `canDelete` is the owner's: delete_task (0040) only removes a task nobody has submitted yet.
export function TaskCatalogItem({ task, canDelete = false }: { task: TaskSummary; canDelete?: boolean }) {
  const [editing, setEditing] = useState(false)
  const editButton = useRef<HTMLButtonElement>(null)
  const boundUpdate = updateTaskAction.bind(null, task.id)
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(
    withSuccessToast(boundUpdate, (s) => Boolean(s?.formError), task.isActive ? 'Task deactivated.' : 'Task reactivated.'),
    undefined,
  )
  const editFormId = `edit-task-${task.id}`
  const toggleErrorId = `toggle-${task.id}-error`

  return (
    <li className="flex flex-col gap-2 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className={cn('min-w-0 break-words font-extrabold', !task.isActive && 'text-ink2')}>
          {task.title} — {task.rewardAmount} DC
        </p>
        <span className="flex flex-wrap gap-1.5">
          {task.isRepeatable && task.period && <StatusChip tone="void">{PERIOD_LABEL[task.period]}</StatusChip>}
          {task.proofRequired && <StatusChip tone="void">Proof required</StatusChip>}
          {!task.isActive && <StatusChip tone="wait">Inactive</StatusChip>}
        </span>
      </div>
      <div className="flex gap-2">
        <Button
          ref={editButton}
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
          {task.proofRequired && <input type="hidden" name="proof_required" value="on" />}
          <FormSubmitButton
            variant={task.isActive ? 'quiet' : 'secondary'}
            size="sm"
            aria-describedby={toggleState?.formError ? toggleErrorId : undefined}
          >
            {task.isActive ? 'Deactivate' : 'Reactivate'}{' '}
            <span className="sr-only">{task.title}</span>
          </FormSubmitButton>
        </form>
        {canDelete && (
          <ConfirmActionButton
            id={`delete-task-${task.id}`}
            trigger="Delete"
            triggerLabel={`Delete ${task.title}`}
            triggerVariant="quiet"
            triggerSize="sm"
            title="Delete this task?"
            description="It’s removed for everyone. A task members have already submitted can’t be deleted; deactivate it instead."
            confirmLabel="Delete task"
            successMessage="Task deleted."
            action={deleteTaskAction.bind(null, task.id)}
          />
        )}
      </div>
      {toggleState?.formError && (
        <Message tone="error" id={toggleErrorId}>
          {toggleState.formError}
        </Message>
      )}
      {/* Save and Cancel both unmount the form under the keyboard, so focus goes back to Edit. */}
      {editing && (
        <EditTaskForm
          id={editFormId}
          task={task}
          onDone={() => {
            setEditing(false)
            editButton.current?.focus()
          }}
        />
      )}
    </li>
  )
}
