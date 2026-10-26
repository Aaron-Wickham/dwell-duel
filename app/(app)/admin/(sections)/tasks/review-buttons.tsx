'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { approveTaskCompletionAction, rejectTaskCompletionAction, type ActionState } from '@/lib/tasks/review-task-completion'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/ui/message'
import { PendingLabel, PendingStatus } from '@/components/ui/pending-label'
import { GENERIC_ERROR } from '@/lib/errors/friendly-error'
import { haptics } from '@/lib/haptics'
import { toastError } from '@/lib/toast/error-toast'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { UNDO_WINDOW_MS, useUndoWindow, type CommitReason } from '@/lib/ui/undo-window'
import { RejectDialog } from './reject-dialog'

// A row's Approve pays at once once sent, so it's held for five seconds with an Undo first (D-7):
// nothing reaches the server until the window ends, and leaving the page during it sends the
// approval rather than dropping it. The approval itself is exactly-once on the server:
// approve_task_completion refuses a submission that isn't pending, and the action counts this
// reviewer's own earlier approval as success, so a replayed request never pays twice. Reject asks
// for its optional reason in a dialog rather than a field on every row (COPY-13).
export function ReviewButtons({
  completionId,
  submitterName,
  taskTitle,
}: {
  completionId: string
  submitterName: string
  taskTitle: string
}) {
  const hasError = (s: ActionState) => Boolean(s?.formError)
  const toastId = `approve-${completionId}`
  const approved = `Approved ${submitterName}’s submission`
  const [approveError, setApproveError] = useState<string | undefined>()
  const [isApprovePending, startApprove] = useTransition()
  const approveButton = useRef<HTMLButtonElement>(null)
  const undoButton = useRef<HTMLButtonElement>(null)
  // Which control should take focus after the window opens or closes; set only by the reviewer's
  // own Approve or Undo, so a commit at the timer's end never pulls focus from wherever they are.
  const focusNext = useRef<'approve' | 'undo' | null>(null)

  async function sendApproval(): Promise<string | undefined> {
    try {
      const result = await approveTaskCompletionAction(completionId, undefined, new FormData())
      return result?.formError
    } catch {
      return GENERIC_ERROR
    }
  }

  function commit(reason: CommitReason) {
    toast.dismiss(toastId)
    if (reason === 'leaving') {
      // The row is going away, so its own error line can't show the outcome: a toast says it.
      void sendApproval().then((formError) => {
        if (formError) toastError(formError)
        else toast.success(`${approved}.`)
      })
      return
    }
    startApprove(async () => {
      const formError = await sendApproval()
      setApproveError(formError)
      if (formError) {
        // The Approving… button goes back to Approve, so focus follows it rather than dropping.
        if (document.activeElement === undoButton.current) focusNext.current = 'approve'
        haptics.error()
        return
      }
      toast.success(`${approved}.`)
      haptics.success()
    })
  }

  const hold = useUndoWindow(commit)

  function startApproval() {
    if (!hold.start()) return
    haptics.tap()
    setApproveError(undefined)
    focusNext.current = 'undo'
    toast(approved, {
      id: toastId,
      duration: Infinity,
      action: { label: 'Undo', onClick: undoApproval },
    })
  }

  function undoApproval() {
    if (!hold.undo()) return
    toast.dismiss(toastId)
    focusNext.current = 'approve'
  }

  const holding = hold.open || isApprovePending
  useEffect(() => {
    const target = focusNext.current === 'undo' ? undoButton.current : focusNext.current === 'approve' ? approveButton.current : null
    focusNext.current = null
    target?.focus()
  }, [holding])

  const [rejecting, setRejecting] = useState(false)
  // Controlled, so a refused reject keeps the typed reason; cleared once the reject goes through.
  const [reason, setReason] = useState('')
  const boundReject = withSuccessToast(
    async (prev: ActionState, formData: FormData) => {
      const next = await rejectTaskCompletionAction(completionId, prev, formData)
      if (!next?.formError) {
        setReason('')
        setRejecting(false)
      }
      return next
    },
    hasError,
    'Submission rejected.',
  )
  const [rejectState, rejectAction, isRejectPending] = useActionState<ActionState, FormData>(boundReject, undefined)
  const approveErrorId = `approve-${completionId}-error`

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-1">
        {holding ? (
          <>
            {/* While the window is open: what's happening, then the one way to stop it. Once the
                approval is sent, the button stays in place (keeping focus) as "Approving…". */}
            {hold.open && (
              <span aria-hidden="true" className="px-1 text-sm font-bold text-ink2">
                Approving…
              </span>
            )}
            <Button
              ref={undoButton}
              size="sm"
              variant="secondary"
              aria-disabled={isApprovePending || undefined}
              onClick={() => {
                if (!isApprovePending) undoApproval()
              }}
            >
              <PendingLabel pending={isApprovePending} pendingLabel="Approving…">
                Undo <span className="sr-only">approving {submitterName}’s {taskTitle}</span>
              </PendingLabel>
            </Button>
          </>
        ) : (
          <>
            <Button
              ref={approveButton}
              size="sm"
              variant="secondary"
              onClick={startApproval}
              aria-describedby={approveError ? approveErrorId : undefined}
            >
              Approve <span className="sr-only">{submitterName}’s {taskTitle}</span>
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setRejecting(true)}>
              <span>Reject<span aria-hidden="true">…</span></span> <span className="sr-only">{submitterName}’s {taskTitle}</span>
            </Button>
          </>
        )}
      </div>
      <span role="status" className="sr-only">
        {hold.open ? `Approving ${submitterName}’s ${taskTitle} in ${UNDO_WINDOW_MS / 1000} seconds. Undo to stop it.` : ''}
      </span>
      <PendingStatus pending={isApprovePending} pendingLabel="Approving…" />
      {approveError && !holding && (
        <Message tone="error" id={approveErrorId}>
          {approveError}
        </Message>
      )}
      <RejectDialog
        formId={`reject-${completionId}`}
        open={rejecting}
        onOpenChange={setRejecting}
        pending={isRejectPending}
        title={`Reject ${submitterName}’s ${taskTitle}?`}
        submitLabel="Reject"
        action={rejectAction}
        reason={reason}
        onReasonChange={setReason}
        error={isRejectPending ? undefined : rejectState?.formError}
        reasonInvalid={!isRejectPending && rejectState?.field === 'reason'}
      />
    </div>
  )
}
