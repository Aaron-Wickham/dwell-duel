'use client'

import { useActionState } from 'react'
import { placeBetAction, type ActionState } from '@/lib/markets/place-bet'

export function BetForm({ marketId, outcomes }: { marketId: string; outcomes: { id: string; label: string }[] }) {
  const boundAction = placeBetAction.bind(null, marketId)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-2">
      <select name="outcome_id" required className="border px-2 py-1">
        {outcomes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <input name="amount" type="number" min="1" step="1" required placeholder="Amount (DC)" className="border px-2 py-1" />
      <button type="submit">Place bet</button>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
