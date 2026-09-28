'use client'

import { useActionState, useState, type ReactNode } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { h2Class } from '@/components/ui/page'
import { focusPageHeading } from '@/lib/ui/focus-page-heading'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { cn } from '@/lib/utils'

export type ConfirmActionState = { formError?: string } | undefined

// A destructive action behind a confirmation dialog: void, delete, remove. A successful action
// usually makes the page stop rendering this button (the row or market is gone), taking the
// trigger with it, so focus goes to the page heading rather than back to a trigger that no longer
// exists. Cancel, Escape and a failed action all leave the trigger in place, so they keep it.
export function ConfirmActionButton({
  id,
  trigger,
  triggerLabel,
  triggerVariant = 'danger',
  triggerSize = 'md',
  block = false,
  title,
  description,
  confirmLabel,
  dismissLabel = 'Cancel',
  hint,
  className,
  successMessage,
  action,
  onDone,
}: {
  id: string
  trigger: ReactNode
  triggerLabel?: string
  triggerVariant?: 'danger' | 'secondary' | 'quiet'
  triggerSize?: 'md' | 'sm'
  block?: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  dismissLabel?: string
  // A standing note under the trigger, which also describes it.
  hint?: string
  className?: string
  successMessage: string
  action: (prev: ConfirmActionState, formData: FormData) => Promise<ConfirmActionState>
  onDone?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [state, formAction, isPending] = useActionState<ConfirmActionState, FormData>(
    withSuccessToast(
      async (prev: ConfirmActionState, formData: FormData) => {
        const next = await action(prev, formData)
        if (next?.formError) setOpen(false)
        else {
          setDone(true)
          onDone?.()
        }
        return next
      },
      (s) => Boolean(s?.formError),
      successMessage,
    ),
    undefined,
  )
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [hint ? hintId : null, state?.formError ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <AlertDialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (isPending && !nextOpen) return
          setOpen(nextOpen)
        }}
      >
        <AlertDialog.Trigger
          className={buttonVariants({ variant: triggerVariant, size: triggerSize, block })}
          aria-label={triggerLabel}
          aria-describedby={describedBy}
        >
          {trigger}
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-scrim transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
          <AlertDialog.Popup
            finalFocus={done ? focusPageHeading : true}
            className="fixed top-[calc(50%+(var(--safe-top)-var(--safe-bottom))/2)] left-1/2 z-40 flex max-h-[calc(100dvh-32px-var(--safe-top)-var(--safe-bottom))] w-[calc(100vw-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-6 text-ink shadow-overlay transition-[opacity,scale] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            <div className="flex flex-col gap-2">
              <AlertDialog.Title className={h2Class}>{title}</AlertDialog.Title>
              <AlertDialog.Description className="text-ink2">{description}</AlertDialog.Description>
            </div>
            <form action={formAction} className="flex flex-col gap-3 md:flex-row md:justify-end">
              {/* aria-disabled plus the root's onOpenChange guard, never the disabled attribute, so
                  focus stays put instead of a member thinking this aborted an irreversible action. */}
              <AlertDialog.Close className={buttonVariants({ variant: 'secondary' })} aria-disabled={isPending || undefined}>
                {dismissLabel}
              </AlertDialog.Close>
              <FormSubmitButton variant="danger">{confirmLabel}</FormSubmitButton>
            </form>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {hint && (
        <p id={hintId} className="text-sm text-ink2">
          {hint}
        </p>
      )}
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
    </div>
  )
}
