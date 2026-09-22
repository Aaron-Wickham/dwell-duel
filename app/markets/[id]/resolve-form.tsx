'use client'

import { useActionState } from 'react'
import { resolveMarketAction, type ActionState } from '@/lib/markets/resolve-market'

export function ResolveForm({ marketId, outcomes }: { marketId: string; outcomes: { id: string; label: string }[] }) {
  const boundAction = resolveMarketAction.bind(null, marketId)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <select name="outcome_id" required className="border px-2 py-1">
        {outcomes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="submit">Confirm outcome</button>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
