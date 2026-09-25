'use client'

import { useActionState } from 'react'
import { approveTaskCompletionAction, rejectTaskCompletionAction, type ActionState } from '@/lib/tasks/review-task-completion'

export function ReviewButtons({ completionId }: { completionId: string }) {
  const boundApprove = approveTaskCompletionAction.bind(null, completionId)
  const boundReject = rejectTaskCompletionAction.bind(null, completionId)
  const [approveState, approveAction] = useActionState<ActionState, FormData>(boundApprove, undefined)
  const [rejectState, rejectAction] = useActionState<ActionState, FormData>(boundReject, undefined)

  return (
    <div className="mt-2 flex gap-2">
      <form action={approveAction}>
        <button type="submit">Approve</button>
      </form>
      <form action={rejectAction} className="flex gap-1">
        <input name="reason" placeholder="Reason (optional)" className="border px-2 py-1 text-sm" />
        <button type="submit">Reject</button>
      </form>
      {approveState?.formError && <p className="text-sm text-red-600">{approveState.formError}</p>}
      {rejectState?.formError && <p className="text-sm text-red-600">{rejectState.formError}</p>}
    </div>
  )
}
