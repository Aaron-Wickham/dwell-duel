'use client'

import { IntentLink } from '@/components/ui/intent-link'
import { useActionState, useState } from 'react'
import type { ReactNode } from 'react'
import {
  bulkApproveTaskCompletionsAction,
  bulkRejectTaskCompletionsAction,
  type BulkActionState,
} from '@/lib/tasks/review-task-completion'
import type { PendingCompletion } from '@/lib/tasks/list-task-completions'
import type { ProofView } from '@/lib/proof/types'
import { Button } from '@/components/ui/button'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmSubmitDialog, useConfirmSubmit } from '@/components/ui/confirm-submit-dialog'
import { focusTarget, rowDomId } from '@/lib/pagination/row-id'
import { keepCheckedOnReset } from '@/lib/forms/keep-on-reset'
import { ProofList } from '@/components/proof/proof-list'
import { eyebrowClass } from '@/components/ui/page'
import { ReviewButtons } from './review-buttons'
import { RejectDialog } from './reject-dialog'
import { formatDcAmount } from '@/lib/format/dc'

export const PENDING_ROW_ID_PREFIX = 'pending'
const BULK_FORM_ID = 'bulk-review-form'
const BULK_REJECT_FORM_ID = 'bulk-reject-form'
const BULK_APPROVE_ERROR_ID = 'bulk-approve-error'
const BULK_REJECT_ERROR_ID = 'bulk-reject-error'

export type PendingRow = PendingCompletion & { submittedAge: string }

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

// "Note · 1 photo": what came with a submission, the summary its disclosure opens from.
export function attachedSummary(note: string | null, proof: ProofView[]): string | null {
  const count = (kind: ProofView['kind']) => proof.filter((p) => p.kind === kind).length
  const parts = [
    note ? 'Note' : null,
    count('image') > 0 ? plural(count('image'), 'photo') : null,
    count('file') > 0 ? plural(count('file'), 'file') : null,
    count('link') > 0 ? plural(count('link'), 'link') : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

// One table at every width (#399): from lg it lays out as columns under its headers; below lg
// each row is a grid (checkbox, then member, task and attachments stacked, then the buttons), and
// the headers are hidden. The roles are explicit because the phone layout changes the elements'
// display, which can drop their implicit table roles.
const rowClass = 'max-lg:grid max-lg:grid-cols-[44px_minmax(0,1fr)_auto] max-lg:gap-x-2 max-lg:py-3'
const cellClass = 'lg:py-3 lg:pr-3 lg:align-top'
const headClass = `${eyebrowClass} py-2.5 pr-3 text-left`

function Attached({ row }: { row: PendingRow }) {
  const summary = attachedSummary(row.note, row.proof)
  if (!summary) return <span className="text-sm text-ink2">Nothing attached</span>
  return (
    <details className="group">
      <summary className="pressable inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-ink2 underline decoration-[1.5px] underline-offset-[3px]">
        {summary}
      </summary>
      <div className="flex flex-col gap-2 pb-2">
        {row.note && <p className="whitespace-pre-line break-words">“{row.note}”</p>}
        {row.proof.length > 0 && <ProofList proof={row.proof} label={`${row.submitterName}’s proof`} />}
      </div>
    </details>
  )
}

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
  const selectedIds = selectable.filter((id) => selected.has(id))
  const selectedCount = selectedIds.length
  const selectedDc = pending.filter((c) => selected.has(c.id) && c.submitterId !== viewerId).reduce((sum, c) => sum + c.rewardAmount, 0)
  // Approve selected pays every reward at once, so it asks first; a row's Approve stays direct
  // (AGENTS.md). An empty selection goes straight to the server's "Select at least one" error
  // rather than a dialog about nothing.
  const confirm = useConfirmSubmit(() => selectedCount > 0)
  const [approveState, approveAction, isApprovePending] = useActionState<BulkActionState | undefined, FormData>(
    async (prev, formData) => {
      const next = await bulkApproveTaskCompletionsAction(prev, formData)
      confirm.setOpen(false)
      return next
    },
    undefined,
  )
  // Reject selected asks for one optional reason in a dialog. Controlled, so a refused reject
  // keeps it; cleared, and the dialog closed, once a reject goes through.
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [rejectState, rejectAction, isRejectPending] = useActionState<BulkActionState | undefined, FormData>(
    async (prev, formData) => {
      const next = await bulkRejectTaskCompletionsAction(prev, formData)
      if (!next?.formError) {
        setReason('')
        setRejecting(false)
      }
      return next
    },
    undefined,
  )
  // Only the most recently used bulk action's result stays visible — otherwise an
  // approve followed by a reject would leave both summaries on screen at once.
  const [lastBulk, setLastBulk] = useState<'approve' | 'reject' | null>(null)
  // Reject selected with nothing ticked says so, rather than opening a dialog about nothing.
  const [nothingToReject, setNothingToReject] = useState(false)
  const rejectNoneShown = lastBulk === 'reject' && nothingToReject

  function startBulkReject() {
    setLastBulk('reject')
    setNothingToReject(selectedCount === 0)
    if (selectedCount > 0) setRejecting(true)
  }

  const allSelected = selectable.length > 0 && selectedCount === selectable.length
  const someSelected = selectedCount > 0 && !allSelected

  function toggle(id: string, checked: boolean) {
    setNothingToReject(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  // Hidden while its own action is pending, so a stale result from an earlier click doesn't flash
  // back on screen for the moment before the new one resolves. Kept when the queue empties, so the
  // last bulk action still says what it did.
  const results = (
    <>
      {lastBulk === 'approve' && !isApprovePending && approveState?.formError && (
        <Message tone="error" id={BULK_APPROVE_ERROR_ID}>
          {approveState.formError}
        </Message>
      )}
      {lastBulk === 'approve' && !isApprovePending && approveState?.summary && <Message tone="ok">{approveState.summary}</Message>}
      {rejectNoneShown && (
        <Message tone="error" id={BULK_REJECT_ERROR_ID}>
          Select at least one completion.
        </Message>
      )}
      {lastBulk === 'reject' && !nothingToReject && !isRejectPending && rejectState?.summary && (
        <Message tone="ok">{rejectState.summary}</Message>
      )}
    </>
  )

  if (pending.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {results}
        {emptyState ?? <EmptyState title="Nothing pending." />}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* At the top and sticky under the top bar, so it's in reach however far down the queue you
          are (#399). */}
      <div className="sticky top-[calc(64px+var(--safe-top)+8px)] z-[2] flex flex-col gap-2 rounded-tile border border-line bg-surface px-3.5 py-2 md:top-[calc(72px+var(--safe-top)+8px)] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-4">
          <label className="pressable inline-flex min-h-11 cursor-pointer items-center gap-2.5 font-bold">
            <input
              type="checkbox"
              checked={allSelected}
              // indeterminate is a DOM property with no attribute, so it's set here on every render.
              ref={(el) => {
                if (el) el.indeterminate = someSelected
              }}
              onChange={(e) => {
                setNothingToReject(false)
                setSelected(e.target.checked ? new Set(selectable) : new Set())
              }}
              className="m-0 size-[22px] accent-primary"
            />
            Select all
          </label>
          <p aria-live="polite" className="font-extrabold">
            {selectedCount} selected · pays <span className="whitespace-nowrap">{formatDcAmount(selectedDc)}</span>
          </p>
        </div>
        {/* The form's own action is the approve, so the confirm dialog's button (which submits through
            its form attribute) runs it. Reject selected opens its own dialog and form. */}
        <form id={BULK_FORM_ID} action={approveAction} onSubmit={confirm.onSubmit} className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="grow"
            onClick={startBulkReject}
            aria-describedby={rejectNoneShown ? BULK_REJECT_ERROR_ID : undefined}
          >
            Reject selected<span aria-hidden="true">…</span>
          </Button>
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
        </form>
      </div>

      {results}

      <table role="table" className="w-full border-collapse max-lg:block">
        <caption className="sr-only">Submissions waiting for review</caption>
        <thead role="rowgroup" className="max-lg:hidden">
          <tr role="row" className="border-b border-line">
            <th role="columnheader" scope="col" className={`${headClass} w-11`}>
              <span className="sr-only">Select</span>
            </th>
            <th role="columnheader" scope="col" className={headClass}>
              Member
            </th>
            <th role="columnheader" scope="col" className={headClass}>
              Task
            </th>
            <th role="columnheader" scope="col" className={headClass}>
              Proof
            </th>
            <th role="columnheader" scope="col" className={headClass}>
              Sent
            </th>
            <th role="columnheader" scope="col" className={headClass}>
              <span className="sr-only">Review</span>
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup" className="divide-y divide-line max-lg:flex max-lg:flex-col">
          {pending.map((c) => {
            const own = c.submitterId === viewerId
            return (
              <tr key={c.id} role="row" {...focusTarget(rowDomId(PENDING_ROW_ID_PREFIX, c.id))} className={rowClass}>
                <td role="cell" className={`${cellClass} max-lg:row-span-3 lg:w-11 lg:py-0.5`}>
                  {!own && (
                    <label className="pressable inline-flex min-h-11 min-w-11 cursor-pointer items-center">
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
                </td>
                <td role="cell" className={`${cellClass} max-lg:col-start-2 max-lg:row-start-1 max-lg:pt-2.5`}>
                  <IntentLink href={`/members/${c.submitterId}`} transitionTypes={['nav-forward']} className="hit-area pressable font-extrabold text-ink">
                    {c.submitterName}
                  </IntentLink>
                </td>
                <td role="cell" className={`${cellClass} max-lg:col-start-2 max-lg:row-start-2`}>
                  {c.taskTitle} · <span className="font-extrabold whitespace-nowrap text-gold">{formatDcAmount(c.rewardAmount)}</span>
                  <span className="text-sm text-ink2 lg:hidden"> · {c.submittedAge}</span>
                </td>
                <td role="cell" className={`${cellClass} max-lg:col-start-2 max-lg:row-start-3 lg:py-0.5`}>
                  <Attached row={c} />
                </td>
                <td role="cell" className={`${cellClass} text-sm whitespace-nowrap text-ink2 max-lg:hidden`}>
                  {c.submittedAge}
                </td>
                <td role="cell" className={`${cellClass} max-lg:col-start-3 max-lg:row-span-3 max-lg:row-start-1 lg:py-0.5 lg:pr-0`}>
                  {own ? (
                    <p className="max-w-40 pt-2.5 text-right text-sm font-bold text-ink2">Yours: another reviewer reviews it.</p>
                  ) : (
                    <ReviewButtons completionId={c.id} submitterName={c.submitterName} taskTitle={c.taskTitle} />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <ConfirmSubmitDialog
        formId={BULK_FORM_ID}
        open={confirm.open}
        onOpenChange={confirm.setOpen}
        pending={isApprovePending}
        title={`Approve ${selectedCount} ${selectedCount === 1 ? 'submission' : 'submissions'}?`}
        description={`Pays ${formatDcAmount(selectedDc)} in rewards straight away.`}
        confirmLabel="Approve and pay"
      />
      <RejectDialog
        formId={BULK_REJECT_FORM_ID}
        open={rejecting}
        onOpenChange={setRejecting}
        pending={isRejectPending}
        title={selectedCount === 1 ? 'Reject 1 submission?' : `Reject ${selectedCount} submissions?`}
        submitLabel={selectedCount === 1 ? 'Reject' : `Reject ${selectedCount}`}
        action={rejectAction}
        reason={reason}
        onReasonChange={setReason}
        error={isRejectPending ? undefined : rejectState?.formError}
        reasonInvalid={!isRejectPending && rejectState?.field === 'reason'}
      >
        {selectedIds.map((id) => (
          <input key={id} type="hidden" name="completionIds" value={id} />
        ))}
      </RejectDialog>
    </div>
  )
}
