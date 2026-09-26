'use client'

import Link from 'next/link'
import { useActionState, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import {
  bulkApproveTaskCompletionsAction,
  bulkRejectTaskCompletionsAction,
  type BulkActionState,
} from '@/lib/tasks/review-task-completion'
import type { PendingCompletion } from '@/lib/tasks/list-task-completions'
import { Input } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { EmptyState } from '@/components/ui/empty-state'
import { ReviewButtons } from './review-buttons'

const BULK_FORM_ID = 'bulk-review-form'
const BULK_APPROVE_ERROR_ID = 'bulk-approve-error'
const BULK_REJECT_ERROR_ID = 'bulk-reject-error'

export type PendingRow = PendingCompletion & { submittedAge: string }

export function PendingApprovals({ pending }: { pending: PendingRow[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [approveState, approveAction, isApprovePending] = useActionState<BulkActionState | undefined, FormData>(bulkApproveTaskCompletionsAction, undefined)
  const [rejectState, rejectAction, isRejectPending] = useActionState<BulkActionState | undefined, FormData>(bulkRejectTaskCompletionsAction, undefined)
  // Only the most recently clicked bulk action's result stays visible — otherwise an
  // approve followed by a reject would leave both summaries on screen at once.
  const [lastBulk, setLastBulk] = useState<'approve' | 'reject' | null>(null)

  function toggleAll(checked: boolean) {
    containerRef.current?.querySelectorAll<HTMLInputElement>('input[name="completionIds"]').forEach((el) => {
      el.checked = checked
    })
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      {/* Hidden while its own action is pending, so a stale result from an earlier click
          doesn't flash back on screen for the moment before the new one resolves. */}
      {lastBulk === 'approve' && !isApprovePending && approveState?.formError && (
        <Message tone="error" id={BULK_APPROVE_ERROR_ID}>
          {approveState.formError}
        </Message>
      )}
      {lastBulk === 'approve' && !isApprovePending && approveState?.summary && <Message tone="ok">{approveState.summary}</Message>}
      {lastBulk === 'reject' && !isRejectPending && rejectState?.formError && (
        <Message tone="error" id={BULK_REJECT_ERROR_ID}>
          {rejectState.formError}
        </Message>
      )}
      {lastBulk === 'reject' && !isRejectPending && rejectState?.summary && <Message tone="ok">{rejectState.summary}</Message>}

      {pending.length === 0 ? (
        <EmptyState icon={Check} title="Nothing pending." />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-line">
            {pending.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 py-4">
                <div className="flex items-start gap-2">
                  <label className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center">
                    {/* Outside the bulk form (row forms can't nest inside it), so the form attribute joins it. */}
                    <input
                      type="checkbox"
                      name="completionIds"
                      value={c.id}
                      form={BULK_FORM_ID}
                      className="m-0 size-[22px] accent-primary"
                    />
                    <span className="sr-only">Select {c.submitterName}’s submission</span>
                  </label>
                  <div className="flex min-w-0 grow flex-col pt-[9px]">
                    <p>
                      <Link href={`/members/${c.submitterId}`} transitionTypes={['nav-forward']}>{c.submitterName}</Link> — <strong>{c.taskTitle}</strong>{' '}
                      <span className="font-extrabold text-gold">({c.rewardAmount} DC)</span>
                    </p>
                    <p className="text-sm text-ink2">Submitted {c.submittedAge}</p>
                  </div>
                </div>
                <ReviewButtons completionId={c.id} />
              </li>
            ))}
          </ul>

          {/* After the rows, not above them as drawn: the e2e suite clicks the first button named "Approve", which must be a row's. */}
          <div className="flex flex-col gap-3 rounded-[14px] bg-sunk p-3.5">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 self-start font-bold">
              <input type="checkbox" onChange={(e) => toggleAll(e.target.checked)} className="m-0 size-[22px] accent-primary" />
              Select all
            </label>
            <form id={BULK_FORM_ID} className="flex flex-col gap-2 md:flex-row md:items-center">
              <label htmlFor="bulk-reason" className="sr-only">
                Shared reason (optional)
              </label>
              <Input id="bulk-reason" name="reason" placeholder="Shared reason (optional)" className="md:grow" />
              <div className="flex flex-wrap shrink-0 gap-2">
                <FormSubmitButton
                  size="sm"
                  formAction={approveAction}
                  className="grow"
                  onClick={() => setLastBulk('approve')}
                  aria-describedby={
                    lastBulk === 'approve' && !isApprovePending && approveState?.formError ? BULK_APPROVE_ERROR_ID : undefined
                  }
                >
                  Approve selected
                </FormSubmitButton>
                <FormSubmitButton
                  size="sm"
                  variant="secondary"
                  formAction={rejectAction}
                  className="grow"
                  onClick={() => setLastBulk('reject')}
                  aria-describedby={
                    lastBulk === 'reject' && !isRejectPending && rejectState?.formError ? BULK_REJECT_ERROR_ID : undefined
                  }
                >
                  Reject selected
                </FormSubmitButton>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
