'use client'

import { useActionState } from 'react'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { voidMarketAction, type ActionState } from '@/lib/markets/void-market'
import { cn } from '@/lib/utils'

export function VoidButton({ marketId, className }: { marketId: string; className?: string }) {
  const boundAction = withSuccessToast(
    voidMarketAction.bind(null, marketId),
    (s) => Boolean(s?.formError),
    'Market voided.',
  )
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction} className={cn('flex flex-col gap-2', className)}>
      <FormSubmitButton
        variant="danger"
        block
        aria-describedby={state?.formError ? 'void-hint void-error' : 'void-hint'}
      >
        Void this market
      </FormSubmitButton>
      <p id="void-hint" className="text-sm text-ink2">
        Voiding refunds every bet and parlay leg.
      </p>
      {state?.formError && (
        <Message tone="error" id="void-error">
          {state.formError}
        </Message>
      )}
    </form>
  )
}
