'use client'

import { useActionState, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Pencil } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { h2Class } from '@/components/ui/page'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { updateMarketAction, type ActionState } from '@/lib/markets/update-market'

// The creator (or an admin) can reword the question and its description until the market closes.
// Outcomes, close time and an over/under's line stay as they are: changing them would change the bet.
export function EditMarketDialog({ marketId, title, description }: { marketId: string; title: string; description: string | null }) {
  const [open, setOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState(title)
  const [draftDescription, setDraftDescription] = useState(description ?? '')
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    withSuccessToast(
      async (prev: ActionState, formData: FormData) => {
        const next = await updateMarketAction(marketId, prev, formData)
        if (next?.saved) setOpen(false)
        return next
      },
      (s) => Boolean(s?.formError),
      'Market updated.',
    ),
    undefined,
  )
  const errorId = 'edit-market-error'

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (isPending && !next) return
        // Each opening starts from the market as it stands, not from an edit that was cancelled.
        if (next) {
          setDraftTitle(title)
          setDraftDescription(description ?? '')
        }
        setOpen(next)
      }}
    >
      <Dialog.Trigger className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} self-start`}>
        <Pencil aria-hidden="true" className="size-[18px]" />
        Edit
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-scrim transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup className="fixed top-[calc(50%+(var(--safe-top)-var(--safe-bottom))/2)] left-1/2 z-40 flex max-h-[calc(100dvh-32px-var(--safe-top)-var(--safe-bottom))] w-[calc(100vw-32px)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-6 text-ink shadow-overlay transition-[opacity,scale] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none">
          <div className="flex flex-col gap-2">
            <Dialog.Title className={h2Class}>Edit market</Dialog.Title>
            <Dialog.Description className="text-ink2">
              Everyone can see what changed. Outcomes and the close time can’t be edited.
            </Dialog.Description>
          </div>
          <form action={formAction} className="flex flex-col gap-4">
            <Field label="Title" htmlFor="edit-market-title">
              <Input
                id="edit-market-title"
                name="title"
                required
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                maxLength={TEXT_LIMITS.marketTitle}
                aria-invalid={state?.field === 'title'}
                aria-describedby={state?.field === 'title' ? errorId : undefined}
              />
            </Field>
            <Field label="Description" htmlFor="edit-market-description">
              <Textarea
                id="edit-market-description"
                name="description"
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                maxLength={TEXT_LIMITS.marketDescription}
                aria-invalid={state?.field === 'description'}
                aria-describedby={state?.field === 'description' ? errorId : undefined}
              />
            </Field>
            {state?.formError && (
              <Message tone="error" id={errorId}>
                {state.formError}
              </Message>
            )}
            <div className="flex flex-col gap-3 md:flex-row md:justify-end">
              <Dialog.Close className={buttonVariants({ variant: 'secondary' })} aria-disabled={isPending || undefined}>
                Cancel
              </Dialog.Close>
              <FormSubmitButton>Save changes</FormSubmitButton>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
