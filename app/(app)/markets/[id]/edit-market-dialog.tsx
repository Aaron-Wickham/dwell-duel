'use client'

import { useActionState, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Pencil } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { dialogBackdropClass, dialogPopupClass } from '@/components/ui/dialog-classes'
import { Field, Input, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { h2Class } from '@/components/ui/page'
import { CategoryField } from '@/components/markets/category-field'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { cn } from '@/lib/utils'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { updateMarketAction, type ActionState } from '@/lib/markets/update-market'

// The creator (or an admin) can reword the question and its description until the market closes,
// and change its category until then too; an admin can change the category at any time (0103), so
// after close the dialog holds only that (`wording` false). Outcomes, close time and an over/under's
// line stay as they are: changing them would change the bet.
export function EditMarketDialog({
  marketId,
  title,
  description,
  category,
  wording,
  suggestions,
  popular,
}: {
  marketId: string
  title: string
  description: string | null
  category: string
  wording: boolean
  suggestions: string[]
  popular: string[]
}) {
  const [open, setOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState(title)
  const [draftDescription, setDraftDescription] = useState(description ?? '')
  const [draftCategory, setDraftCategory] = useState(category)
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
          setDraftCategory(category)
        }
        setOpen(next)
      }}
    >
      <Dialog.Trigger className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} self-start`}>
        <Pencil aria-hidden="true" className="size-[18px]" />
        {wording ? 'Edit' : 'Edit category'}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdropClass} />
        <Dialog.Popup className={cn(dialogPopupClass, 'max-w-[560px]')}>
          <div className="flex flex-col gap-2">
            <Dialog.Title className={h2Class}>{wording ? 'Edit market' : 'Edit category'}</Dialog.Title>
            <Dialog.Description className="text-ink2">
              {wording
                ? 'Everyone can see what changed. Outcomes and the close time can’t be edited.'
                : 'Everyone can see what changed. This market has closed, so only its category can change.'}
            </Dialog.Description>
          </div>
          <form action={formAction} className="flex flex-col gap-4">
            {wording && (
              <>
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
              </>
            )}
            <CategoryField
              id="edit-market-category"
              value={draftCategory}
              onChange={setDraftCategory}
              suggestions={suggestions}
              popular={popular}
              errorId={errorId}
              invalid={state?.field === 'category'}
            />
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
