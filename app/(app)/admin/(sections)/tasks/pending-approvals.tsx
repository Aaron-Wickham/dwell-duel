'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import type { ReactNode } from 'react'
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
import { ListCard, listCardsClass } from '@/components/ui/list-card'
import { ConfirmSubmitDialog, useConfirmSubmit } from '@/components/ui/confirm-submit-dialog'
import { focusTarget, rowDomId } from '@/lib/pagination/row-id'
import { keepCheckedOnReset } from '@/lib/forms/keep-on-reset'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { ProofList } from '@/components/proof/proof-list'
import { cn } from '@/lib/utils'
import { ReviewButtons } from './review-buttons'
import { formatDcAmount } from '@/lib/format/dc'

export const PENDING_ROW_ID_PREFIX = 'pending'
const BULK_FORM_ID = 'bulk-review-form'
const BULK_APPROVE_ERROR_ID = 'bulk-approve-error'
const BULK_REJECT_ERROR_ID = 'bulk-reject-error'

export type PendingRow = PendingCompletion & { submittedAge: string }

// viewerId: a reviewer never reviews their own submission (0046), so those rows show why instead.
export function PendingApprovals({
  pending,
  viewerId,
  emptyState,
}: {
  pending: PendingRow[]
  viewerId: string
  // Shown instead of "Nothing pending." when the page is a window past the end of the queue.
  emptyState?: ReactNode
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  // Worked out from the rows on screen, so Select all follows rows that leave the list once reviewed.
  const selectable = pending.filter((c) => c.submitterId !== viewerId).map((c) => c.id)
  const selectedCount = selectable.filter((id) => selected.has(id)).length
  const selectedDc = pending.filter((c) => selected.has(c.id) && c.submitterId !== viewerId).reduce((sum, c) => sum + c.rewardAmount, 0)
  // Approve selected pays every reward at once, so it asks first; a row's Approve stays direct
  // (AGENTS.md). Reject selected moves no coins, and an empty selection goes straight to the
  // server's "Select at least one" error rather than a dialog about nothing.
  const confirm = useConfirmSubmit((submitter) => !submitter?.hasAttribute('data-bulk-reject') && selectedCount > 0)
  const [approveState, approveAction, isApprovePending] = useActionState<BulkActionState | undefined, FormData>(
    async (prev, formData) => {
      const next = await bulkApproveTaskCompletionsAction(prev, formData)
      confirm.setOpen(false)
      return next
    },
    undefined,
  )
  // Controlled, so a refused reject keeps the shared reason; cleared once a reject goes through.
  const [reason, setReason] = useState('')
  const [rejectState, rejectAction, isRejectPending] = useActionState<BulkActionState | undefined, FormData>(
    async (prev, formData) => {
      const next = await bulkRejectTaskCompletionsAction(prev, formData)
      if (!next?.formError) setReason('')
      return next
    },
    undefined,
  )
  // Only the most recently clicked bulk action's result stays visible — otherwise an
  // approve followed by a reject would leave both summaries on screen at once.
  const [lastBulk, setLastBulk] = useState<'approve' | 'reject' | null>(null)
  const bulkReasonInvalid = lastBulk === 'reject' && !isRejectPending && rejectState?.field === 'reason'

  const allSelected = selectable.length > 0 && selectedCount === selectable.length
  const someSelected = selectedCount > 0 && !allSelected

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
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
        emptyState ?? <EmptyState icon={Check} title="Nothing pending." />
      ) : (
        <>
          <ul className={cn(listCardsClass, 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-5')}>
            {pending.map((c) => {
              const own = c.submitterId === viewerId
              return (
              <ListCard key={c.id} tappable={false} {...focusTarget(rowDomId(PENDING_ROW_ID_PREFIX, c.id))} className="flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  {own ? (
                    <span aria-hidden="true" className="min-w-11 shrink-0" />
                  ) : (
                  <label className="pressable inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center">
                    {/* Outside the bulk form (row forms can't nest inside it), so the form attribute joins it. */}
                    <input
                      type="checkbox"
                      name="completionIds"
                      value={c.id}
                      form={BULK_FORM_ID}
                      checked={selected.has(c.id)}
                      ref={keepCheckedOnReset(selected.has(c.id))}
                      onChange={(e) => toggle(c.id, e.target.checked)}
                      className="m-0 size-[22px] accent-primary"
                    />
                    <span className="sr-only">Select {c.submitterName}’s submission</span>
                  </label>
                  )}
                  <div className="flex min-w-0 grow flex-col pt-[9px]">
                    <p>
                      <Link href={`/members/${c.submitterId}`} transitionTypes={['nav-forward']}>{c.submitterName}</Link> — <strong>{c.taskTitle}</strong>{' '}
                      <span className="font-extrabold text-gold">({formatDcAmount(c.rewardAmount)})</span>
                    </p>
                    <p className="text-sm text-ink2">Submitted {c.submittedAge}</p>
                    {c.note && <p className="mt-2 whitespace-pre-line break-words">“{c.note}”</p>}
                    {c.proof.length > 0 && (
                      <div className="mt-2">
                        <ProofList proof={c.proof} label={`${c.submitterName}’s proof`} />
                      </div>
                    )}
                  </div>
                </div>
                {own ? (
                  <p className="text-sm font-bold text-ink2">This is your submission, so another reviewer reviews it.</p>
                ) : (
                  <ReviewButtons completionId={c.id} submitterName={c.submitterName} taskTitle={c.taskTitle} />
                )}
              </ListCard>
              )
            })}
          </ul>

          {/* After the rows, not above them as drawn: the e2e suite clicks the first button named "Approve", which must be a row's. */}
          <div className="flex flex-col gap-3 rounded-tile bg-sunk p-3.5">
            <label className="pressable inline-flex min-h-11 cursor-pointer items-center gap-2.5 self-start font-bold">
              <input
                type="checkbox"
                checked={allSelected}
                // indeterminate is a DOM property with no attribute, so it's set here on every render.
                ref={(el) => {
                  if (el) el.indeterminate = someSelected
                }}
                onChange={(e) => setSelected(e.target.checked ? new Set(selectable) : new Set())}
                className="m-0 size-[22px] accent-primary"
              />
              Select all
            </label>
            {/* The form's own action is the approve, so the confirm dialog's button (which submits through
                its form attribute) runs it; Reject selected carries its own formAction. */}
            <form id={BULK_FORM_ID} action={approveAction} onSubmit={confirm.onSubmit} className="flex flex-col gap-2 md:flex-row md:items-center">
              <label htmlFor="bulk-reason" className="sr-only">
                Shared reason (optional)
              </label>
              <Input
                id="bulk-reason"
                name="reason"
                placeholder="Shared reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={TEXT_LIMITS.reviewNote}
                className="md:grow"
                aria-invalid={bulkReasonInvalid}
                aria-describedby={bulkReasonInvalid ? BULK_REJECT_ERROR_ID : undefined}
              />
              <div className="flex flex-wrap shrink-0 gap-2">
                <FormSubmitButton
                  size="sm"
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
                  data-bulk-reject=""
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
            <ConfirmSubmitDialog
              formId={BULK_FORM_ID}
              open={confirm.open}
              onOpenChange={confirm.setOpen}
              pending={isApprovePending}
              title={`Approve ${selectedCount} ${selectedCount === 1 ? 'submission' : 'submissions'}?`}
              description={`Pays ${formatDcAmount(selectedDc)} in rewards straight away.`}
              confirmLabel="Approve and pay"
            />
          </div>
        </>
      )}
    </div>
  )
}
