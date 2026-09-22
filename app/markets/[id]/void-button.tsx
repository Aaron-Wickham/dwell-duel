'use client'

import { useActionState } from 'react'
import { voidMarketAction, type ActionState } from '@/lib/markets/void-market'

export function VoidButton({ marketId }: { marketId: string }) {
  const boundAction = voidMarketAction.bind(null, marketId)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction} className="mt-4">
      <button type="submit" className="text-sm text-red-600 underline">
        Void this market
      </button>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
