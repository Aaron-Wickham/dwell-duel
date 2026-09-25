'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Message } from '@/components/ui/message'
import { voidMarketAction, type ActionState } from '@/lib/markets/void-market'
import { cn } from '@/lib/utils'

export function VoidButton({ marketId, className }: { marketId: string; className?: string }) {
  const boundAction = voidMarketAction.bind(null, marketId)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction} className={cn('flex flex-col gap-2', className)}>
      <Button
        type="submit"
        variant="danger"
        block
        aria-describedby={state?.formError ? 'void-hint void-error' : 'void-hint'}
      >
        Void this market
      </Button>
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
