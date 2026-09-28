'use client'

import { useActionState, useState } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { h2Class } from '@/components/ui/page'
import { focusPageHeading } from '@/lib/ui/focus-page-heading'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { cancelBetAction, type ActionState } from '@/lib/markets/cancel-bet'

export function CancelBetButton({ betId, amount, outcomeLabel }: { betId: number; amount: number; outcomeLabel: string }) {
  const [open, setOpen] = useState(false)
  // A cancelled bet's row disappears on revalidate, trigger and all, as with VoidButton.
  const [cancelled, setCancelled] = useState(false)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    withSuccessToast(
      async (prev: ActionState, formData: FormData) => {
        const next = await cancelBetAction(betId, prev, formData)
        if (next?.formError) setOpen(false)
        else setCancelled(true)
        return next
      },
      (s) => Boolean(s?.formError),
      `Bet cancelled. ${amount} DC refunded.`,
    ),
    undefined,
  )
  const errorId = `cancel-bet-error-${betId}`

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <AlertDialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (isPending && !nextOpen) return
          setOpen(nextOpen)
        }}
      >
        <AlertDialog.Trigger
          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          aria-label={`Cancel your ${amount} DC bet on ${outcomeLabel}`}
          aria-describedby={state?.formError ? errorId : undefined}
        >
          Cancel
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-scrim transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
          <AlertDialog.Popup
            finalFocus={cancelled ? focusPageHeading : true}
            className="fixed top-[calc(50%+(var(--safe-top)-var(--safe-bottom))/2)] left-1/2 z-40 flex max-h-[calc(100dvh-32px-var(--safe-top)-var(--safe-bottom))] w-[calc(100vw-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-6 text-ink shadow-overlay transition-[opacity,scale] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            <div className="flex flex-col gap-2">
              <AlertDialog.Title className={h2Class}>Cancel this bet?</AlertDialog.Title>
              <AlertDialog.Description className="text-ink2">
                Your {amount} DC on {outcomeLabel} comes back to your balance.
              </AlertDialog.Description>
            </div>
            <form action={formAction} className="flex flex-col gap-3 md:flex-row md:justify-end">
              <AlertDialog.Close className={buttonVariants({ variant: 'secondary' })} aria-disabled={isPending || undefined}>
                Keep bet
              </AlertDialog.Close>
              <FormSubmitButton variant="danger">Cancel bet</FormSubmitButton>
            </form>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
    </div>
  )
}
