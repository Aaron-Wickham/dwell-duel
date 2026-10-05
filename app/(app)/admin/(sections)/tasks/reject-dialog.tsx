'use client'

import type { ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { buttonVariants } from '@/components/ui/button'
import { dialogBackdropClass, dialogPopupClass } from '@/components/ui/dialog-classes'
import { Field, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { h2Class } from '@/components/ui/page'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { cn } from '@/lib/utils'

// The one place a reason is asked for, after Reject is pressed (COPY-13), for a single row or for
// everything selected. Rejecting moves no coins, so the dialog itself is the only step. The reason
// is controlled by the caller, so a refused reject keeps what was typed.
export function RejectDialog({
  formId,
  open,
  onOpenChange,
  pending,
  title,
  submitLabel,
  action,
  reason,
  onReasonChange,
  error,
  reasonInvalid,
  children,
}: {
  formId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  title: string
  submitLabel: string
  action: (formData: FormData) => void
  reason: string
  onReasonChange: (reason: string) => void
  error?: string
  // The server refused the reason itself (too long), not the reject.
  reasonInvalid: boolean
  // Hidden fields the action needs, such as the selected ids.
  children?: ReactNode
}) {
  const reasonId = `${formId}-reason`
  const errorId = `${formId}-error`
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (pending && !next) return
        onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdropClass} />
        <Dialog.Popup className={cn(dialogPopupClass, 'max-w-[480px]')}>
          <div className="flex flex-col gap-2">
            <Dialog.Title className={h2Class}>{title}</Dialog.Title>
            <Dialog.Description className="text-ink2">Nothing is paid. They can try again.</Dialog.Description>
          </div>
          <form id={formId} action={action} className="flex flex-col gap-4">
            {children}
            <Field label="Why not? (optional)" htmlFor={reasonId} hint="Shown to them with the rejection.">
              <Textarea
                id={reasonId}
                name="reason"
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                maxLength={TEXT_LIMITS.reviewNote}
                aria-invalid={reasonInvalid}
                aria-describedby={[`${reasonId}-hint`, error ? errorId : null].filter(Boolean).join(' ')}
              />
            </Field>
            {error && (
              <Message tone="error" id={errorId}>
                {error}
              </Message>
            )}
            <div className="flex flex-col gap-3 md:flex-row md:justify-end">
              <Dialog.Close className={buttonVariants({ variant: 'secondary' })} aria-disabled={pending || undefined}>
                Cancel
              </Dialog.Close>
              <FormSubmitButton>{submitLabel}</FormSubmitButton>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
