'use client'

import { useActionState, useOptimistic, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { PendingReviewChip } from '@/components/tasks/task-row'
import { ProofPicker } from '@/components/proof/proof-picker'
import { buttonVariants } from '@/components/ui/button'
import { dialogBackdropClass, dialogPopupClass } from '@/components/ui/dialog-classes'
import { Field, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { h2Class } from '@/components/ui/page'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { focusPageHeading } from '@/lib/ui/focus-page-heading'
import { discardProof, uploadProof } from '@/lib/proof/upload'
import type { ProofDraft, ProofRecord } from '@/lib/proof/types'
import { cn } from '@/lib/utils'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { submitTaskCompletionAction, type ActionState } from '@/lib/tasks/submit-task-completion'

// "I did this" opens a dialog for an optional note and proof (photos, a document, links). Files
// upload from the browser first, then the action records them with the submission; if the
// submission fails, the uploads are removed again.
export function SubmitTaskDialog({
  taskId,
  taskTitle,
  memberId,
  proofRequired,
}: {
  taskId: string
  taskTitle: string
  memberId: string
  proofRequired: boolean
}) {
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<ProofDraft[]>([])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useOptimistic(false)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    withSuccessToast(
      async (prev: ActionState, formData: FormData) => {
        if (proofRequired && drafts.length === 0) return { formError: 'This task needs proof: add a photo, file or link.' }
        let records: ProofRecord[] = []
        try {
          records = await uploadProof(drafts, `task/${memberId}/`)
        } catch (error) {
          return { formError: error instanceof Error ? error.message : 'An attachment didn’t upload. Try again.' }
        }
        formData.set('attachments', JSON.stringify(records))
        setSubmitting(true)
        const next = await submitTaskCompletionAction(taskId, prev, formData)
        if (next?.formError) await discardProof(records)
        else {
          setOpen(false)
          setDrafts([])
          setNote('')
        }
        return next
      },
      (s) => Boolean(s?.formError),
      'Submitted for review.',
    ),
    undefined,
  )
  const id = `submit-${taskId}`
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  // TaskRow renders this only while the task is available; once the server has the submission the
  // row shows its own chip in the same render that ends `submitting`. Until then the chip stands in
  // for the trigger here, with the dialog still mounted and closed: unmounting it open would drop
  // focus on <body>, and its trigger is gone, so the dialog hands focus to the page heading instead.
  return (
    <Dialog.Root
      open={open && !submitting}
      onOpenChange={(next) => {
        if (isPending && !next) return
        setOpen(next)
      }}
    >
      {submitting ? (
        <PendingReviewChip />
      ) : (
        <Dialog.Trigger className={buttonVariants({ size: 'sm' })}>
          I did this<span className="sr-only">, {taskTitle}</span>
        </Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdropClass} />
        <Dialog.Popup finalFocus={submitting ? focusPageHeading : true} className={cn(dialogPopupClass, 'max-w-[520px]')}>
          <div className="flex flex-col gap-2">
            <Dialog.Title className={h2Class}>Submit “{taskTitle}”</Dialog.Title>
            <Dialog.Description id={hintId} className="text-ink2">
              {proofRequired
                ? 'This task needs proof: add a photo, file or link for the reviewer.'
                : 'Add a note or proof for the reviewer if you like. Only you and reviewers see it.'}
            </Dialog.Description>
          </div>
          <form action={formAction} className="flex flex-col gap-4">
            <Field label="Note (optional)" htmlFor={`${id}-note`}>
              <Textarea
                id={`${id}-note`}
                name="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={TEXT_LIMITS.proofNote}
                aria-invalid={state?.field === 'note'}
                aria-describedby={state?.field === 'note' ? errorId : undefined}
              />
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-[15px] font-bold">{proofRequired ? 'Proof' : 'Proof (optional)'}</legend>
              <ProofPicker id={`${id}-proof`} value={drafts} onChange={setDrafts} />
            </fieldset>
            {state?.formError && (
              <Message tone="error" id={errorId}>
                {state.formError}
              </Message>
            )}
            <div className="flex flex-col gap-3 md:flex-row md:justify-end">
              <Dialog.Close className={buttonVariants({ variant: 'secondary' })} aria-disabled={isPending || undefined}>
                Cancel
              </Dialog.Close>
              <FormSubmitButton aria-describedby={state?.formError && !state.field ? errorId : undefined}>
                Submit for review
              </FormSubmitButton>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
