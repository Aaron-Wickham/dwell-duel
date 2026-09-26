'use client'

import { useActionState, useState } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { h2Class } from '@/components/ui/page'
import { focusPageHeading } from '@/lib/ui/focus-page-heading'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { voidMarketAction, type ActionState } from '@/lib/markets/void-market'
import { cn } from '@/lib/utils'

export function VoidButton({ marketId, className }: { marketId: string; className?: string }) {
  const [open, setOpen] = useState(false)
  // A successful void makes the parent stop rendering this button once it revalidates, taking
  // the trigger with it -- so Base UI's default "return focus to the trigger" has nothing left
  // to land on. Cancel, Escape and a failed void all leave the trigger in place, so they keep it.
  const [voided, setVoided] = useState(false)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    withSuccessToast(
      async (prev: ActionState, formData: FormData) => {
        const next = await voidMarketAction(marketId, prev, formData)
        // A failure closes the dialog so the error shows beside the trigger, where focus returns.
        if (next?.formError) setOpen(false)
        else setVoided(true)
        return next
      },
      (s) => Boolean(s?.formError),
      'Market voided.',
    ),
    undefined,
  )

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <AlertDialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          // Ignore Escape, Cancel and any other close request while the void is in flight.
          if (isPending && !nextOpen) return
          setOpen(nextOpen)
        }}
      >
        <AlertDialog.Trigger
          className={buttonVariants({ variant: 'danger', block: true })}
          aria-describedby={state?.formError ? 'void-hint void-error' : 'void-hint'}
        >
          Void this market
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-scrim transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
          <AlertDialog.Popup
            finalFocus={voided ? focusPageHeading : true}
            className="fixed top-[calc(50%+(var(--safe-top)-var(--safe-bottom))/2)] left-1/2 z-40 flex max-h-[calc(100dvh-32px-var(--safe-top)-var(--safe-bottom))] w-[calc(100vw-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-6 text-ink shadow-overlay transition-[opacity,scale] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            <div className="flex flex-col gap-2">
              <AlertDialog.Title className={h2Class}>Void this market?</AlertDialog.Title>
              <AlertDialog.Description className="text-ink2">
                Every bet and parlay leg is refunded. This can’t be undone.
              </AlertDialog.Description>
            </div>
            <form action={formAction} className="flex flex-col gap-3 md:flex-row md:justify-end">
              <AlertDialog.Close
                className={buttonVariants({ variant: 'secondary' })}
                // Matches FormSubmitButton's own pending guard -- aria-disabled plus a
                // click that doesn't close, never the disabled attribute, so focus stays put
                // instead of a member thinking Cancel aborted an irreversible action. The
                // actual block is the root's onOpenChange guard, since Base UI's Close ignores
                // a handler's preventDefault(); this is only the visual/AT state to match it.
                aria-disabled={isPending || undefined}
              >
                Cancel
              </AlertDialog.Close>
              <FormSubmitButton variant="danger">Void market</FormSubmitButton>
            </form>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <p id="void-hint" className="text-sm text-ink2">
        Voiding refunds every bet and parlay leg.
      </p>
      {state?.formError && (
        <Message tone="error" id="void-error">
          {state.formError}
        </Message>
      )}
    </div>
  )
}
