'use client'

import { useState, type ComponentProps, type FormEvent, type ReactNode } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { ConfirmDialogPopup } from '@/components/ui/confirm-action-button'

const CONFIRMED = 'data-confirmed-submit'

// Holds a form's submit until the member confirms it. Any submit (the form's own button, Enter in
// a field) opens the dialog instead; only the dialog's button, which joins the form through its
// `form` attribute from inside the portal, lets the form's action run. The form keeps its fields
// and its action, so Cancel leaves everything exactly as filled in.
export function useConfirmSubmit() {
  const [open, setOpen] = useState(false)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    if (submitter?.hasAttribute(CONFIRMED)) return
    event.preventDefault()
    setOpen(true)
  }

  return { open, setOpen, onSubmit }
}

export function ConfirmSubmitDialog({
  formId,
  open,
  onOpenChange,
  pending,
  title,
  description,
  confirmLabel,
  dismissLabel = 'Cancel',
  variant = 'primary',
  finalFocus = true,
}: {
  formId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  dismissLabel?: string
  variant?: 'primary' | 'danger'
  finalFocus?: ComponentProps<typeof AlertDialog.Popup>['finalFocus']
}) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (pending && !next) return
        onOpenChange(next)
      }}
    >
      <ConfirmDialogPopup title={title} description={description} finalFocus={finalFocus}>
        <div className="flex flex-col gap-3 md:flex-row md:justify-end">
          {/* aria-disabled, never disabled, as in ConfirmActionButton: focus stays put while it runs. */}
          <AlertDialog.Close className={buttonVariants({ variant: 'secondary' })} aria-disabled={pending || undefined}>
            {dismissLabel}
          </AlertDialog.Close>
          <Button
            type="submit"
            form={formId}
            variant={variant}
            {...{ [CONFIRMED]: '' }}
            aria-disabled={pending || undefined}
            onClick={(event) => {
              if (pending) event.preventDefault()
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </ConfirmDialogPopup>
    </AlertDialog.Root>
  )
}
