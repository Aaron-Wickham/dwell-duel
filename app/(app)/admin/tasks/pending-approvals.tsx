'use client'

import { useActionState, useRef } from 'react'
import {
  bulkApproveTaskCompletionsAction,
  bulkRejectTaskCompletionsAction,
  type BulkActionState,
} from '@/lib/tasks/review-task-completion'
import { ReviewButtons } from './review-buttons'
import type { PendingCompletion } from '@/lib/tasks/list-task-completions'

const BULK_FORM_ID = 'bulk-review-form'

export function PendingApprovals({ pending }: { pending: PendingCompletion[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [approveState, approveAction] = useActionState<BulkActionState | undefined, FormData>(bulkApproveTaskCompletionsAction, undefined)
  const [rejectState, rejectAction] = useActionState<BulkActionState | undefined, FormData>(bulkRejectTaskCompletionsAction, undefined)

  function toggleAll(checked: boolean) {
    containerRef.current?.querySelectorAll<HTMLInputElement>('input[name="completionIds"]').forEach((el) => {
      el.checked = checked
    })
  }

  return (
    <div ref={containerRef}>
      {pending.length > 0 && (
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" onChange={(e) => toggleAll(e.target.checked)} />
          Select all
        </label>
      )}
      <ul className="mt-2 space-y-3">
        {pending.map((c) => (
          <li key={c.id} className="border p-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="completionIds" value={c.id} form={BULK_FORM_ID} />
              {c.submitterName} — {c.taskTitle}
            </label>
            <ReviewButtons completionId={c.id} />
          </li>
        ))}
        {pending.length === 0 && <p className="text-sm text-foreground/70">Nothing pending.</p>}
      </ul>

      {pending.length > 0 && (
        <form id={BULK_FORM_ID} className="mt-3 flex items-center gap-2">
          <button type="submit" formAction={approveAction}>
            Approve selected
          </button>
          <input name="reason" placeholder="Reason (optional)" className="border px-2 py-1 text-sm" />
          <button type="submit" formAction={rejectAction}>
            Reject selected
          </button>
        </form>
      )}
      {approveState?.formError && <p className="mt-2 text-sm text-red-600">{approveState.formError}</p>}
      {approveState?.summary && <p className="mt-2 text-sm">{approveState.summary}</p>}
      {rejectState?.formError && <p className="mt-2 text-sm text-red-600">{rejectState.formError}</p>}
      {rejectState?.summary && <p className="mt-2 text-sm">{rejectState.summary}</p>}
    </div>
  )
}
