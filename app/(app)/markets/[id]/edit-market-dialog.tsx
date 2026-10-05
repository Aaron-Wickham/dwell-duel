'use client'

import { useActionState, useState, type RefObject } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { buttonVariants } from '@/components/ui/button'
import { ConfirmSubmitDialog, useConfirmSubmit } from '@/components/ui/confirm-submit-dialog'
import { dialogBackdropClass, dialogPopupClass } from '@/components/ui/dialog-classes'
import { Field, Input, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { h2Class } from '@/components/ui/page'
import { CategoryField } from '@/components/markets/category-field'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { formatDateTime } from '@/lib/markets/format-date'
import { localInputValue } from '@/lib/markets/weekly-close'
import { cn } from '@/lib/utils'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { updateMarketAction, type ActionState } from '@/lib/markets/update-market'

// What the dialog can change (0103, 0106). `edit`: the creator or an admin, while the market takes
// bets: the wording, the category and the close time. `category`: an admin, once it has closed.
// `reopen`: the creator or an admin, once it has closed and before it's settled: only a new close
// time. Outcomes and an over/under's line stay as they are: changing them would change the bet.
export type EditMarketMode = 'edit' | 'category' | 'reopen'

const COPY: Record<EditMarketMode, { trigger: string; title: string; description: string; submit: string; toast: string }> = {
  edit: {
    trigger: 'Edit',
    title: 'Edit market',
    description: 'Everyone can see what changed. Outcomes can’t be edited.',
    submit: 'Save changes',
    toast: 'Market updated.',
  },
  category: {
    trigger: 'Edit category',
    title: 'Edit category',
    description: 'Everyone can see what changed. This market has closed, so only its category can change.',
    submit: 'Save changes',
    toast: 'Market updated.',
  },
  reopen: {
    trigger: 'Reopen',
    title: 'Reopen market',
    description:
      'Choose when betting closes again. Only reopen if the result isn’t known yet. Bets already placed stay as they are, and everyone can see the change.',
    submit: 'Reopen market',
    toast: 'Market reopened.',
  },
}

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// The instant a datetime-local value names in the browser's zone, or '' while it isn't one.
function instantOf(local: string): string {
  const date = new Date(local)
  return local && !Number.isNaN(date.getTime()) ? date.toISOString() : ''
}

// The menu item that opens each mode (market-menu.tsx).
export function editMenuLabel(mode: EditMarketMode): string {
  return COPY[mode].trigger
}

// Opened from the market's "More actions" menu, so it has no trigger of its own: the menu holds
// `open`, and focus goes back to the menu's button (`finalFocus`) when it closes.
export function EditMarketDialog({
  marketId,
  title,
  description,
  category,
  closeAt,
  mode,
  canMoveClose = true,
  suggestions,
  popular,
  open,
  onOpenChange,
  finalFocus,
}: {
  marketId: string
  title: string
  description: string | null
  category: string
  closeAt: string
  mode: EditMarketMode
  // In `edit`, whether the close time is offered: a creator with a stake can't move it (0106).
  canMoveClose?: boolean
  suggestions: string[]
  popular: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus?: RefObject<HTMLElement | null>
}) {
  const copy = COPY[mode]
  const wording = mode === 'edit'
  const hasCategory = mode !== 'reopen'
  const hasClose = mode === 'reopen' || (mode === 'edit' && canMoveClose)
  const [draftTitle, setDraftTitle] = useState(title)
  const [draftDescription, setDraftDescription] = useState(description ?? '')
  const [draftCategory, setDraftCategory] = useState(category)
  // The close as the picker showed it on opening. Only a change from it is sent: the picker drops
  // seconds, so sending it untouched would move the close.
  const [shownClose, setShownClose] = useState('')
  const [draftClose, setDraftClose] = useState('')
  // Each opening starts from the market as it stands, not from an edit that was cancelled.
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraftTitle(title)
      setDraftDescription(description ?? '')
      setDraftCategory(category)
      const shown = mode === 'edit' ? localInputValue(closeAt, browserTimeZone()) : ''
      setShownClose(shown)
      setDraftClose(shown)
    }
  }
  const closeChanged = hasClose && (mode === 'reopen' || draftClose !== shownClose)
  const newClose = closeChanged ? instantOf(draftClose) : ''
  const confirm = useConfirmSubmit(() => closeChanged)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    withSuccessToast(
      async (prev: ActionState, formData: FormData) => {
        try {
          const next = await updateMarketAction(marketId, prev, formData)
          if (next?.saved) onOpenChange(false)
          return next
        } finally {
          confirm.setOpen(false)
        }
      },
      (s) => Boolean(s?.formError),
      copy.toast,
    ),
    undefined,
  )
  const formId = `edit-market-${mode}`
  const errorId = `${formId}-error`
  const closeId = `${formId}-close`

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (isPending && !next) return
        onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdropClass} />
        <Dialog.Popup finalFocus={finalFocus} className={cn(dialogPopupClass, 'max-w-[560px]')}>
          <div className="flex flex-col gap-2">
            <Dialog.Title className={h2Class}>{copy.title}</Dialog.Title>
            <Dialog.Description className="text-ink2">{copy.description}</Dialog.Description>
          </div>
          <form id={formId} action={formAction} onSubmit={confirm.onSubmit} className="flex flex-col gap-4">
            {wording && (
              <>
                <Field label="Title" htmlFor={`${formId}-title`}>
                  <Input
                    id={`${formId}-title`}
                    name="title"
                    required
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    maxLength={TEXT_LIMITS.marketTitle}
                    aria-invalid={state?.field === 'title'}
                    aria-describedby={state?.field === 'title' ? errorId : undefined}
                  />
                </Field>
                <Field label="Description" htmlFor={`${formId}-description`}>
                  <Textarea
                    id={`${formId}-description`}
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
            {hasCategory && (
              <CategoryField
                id={`${formId}-category`}
                value={draftCategory}
                onChange={setDraftCategory}
                suggestions={suggestions}
                popular={popular}
                errorId={errorId}
                invalid={state?.field === 'category'}
              />
            )}
            {hasClose && (
              <Field
                label="Close time"
                htmlFor={closeId}
                hint={mode === 'reopen' ? 'Betting opens again until then.' : 'Later or earlier, as long as it’s still to come.'}
              >
                <Input
                  id={closeId}
                  type="datetime-local"
                  required
                  value={draftClose}
                  onChange={(e) => setDraftClose(e.target.value)}
                  aria-invalid={state?.field === 'close_at'}
                  aria-describedby={[`${closeId}-hint`, state?.field === 'close_at' ? errorId : null].filter(Boolean).join(' ')}
                />
              </Field>
            )}
            {/* The picker's value is local wall-clock time; the server needs the instant it names. */}
            {closeChanged && <input type="hidden" name="close_at" value={newClose} />}
            {state?.formError && (
              <Message tone="error" id={errorId}>
                {state.formError}
              </Message>
            )}
            <div className="flex flex-col gap-3 md:flex-row md:justify-end">
              <Dialog.Close className={buttonVariants({ variant: 'secondary' })} aria-disabled={isPending || undefined}>
                Cancel
              </Dialog.Close>
              <FormSubmitButton>{copy.submit}</FormSubmitButton>
            </div>
          </form>
          <ConfirmSubmitDialog
            formId={formId}
            open={confirm.open}
            onOpenChange={confirm.setOpen}
            pending={isPending}
            title={mode === 'reopen' ? 'Reopen this market?' : 'Change the close time?'}
            description={
              <>
                Members can bet until {newClose ? formatDateTime(newClose) : 'the new close time'}. Bets already placed stay
                as they are.
              </>
            }
            confirmLabel={copy.submit}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
