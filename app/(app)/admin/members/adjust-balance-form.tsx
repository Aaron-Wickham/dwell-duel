'use client'

import { useActionState } from 'react'
import { adjustBalanceAction, type ActionState } from '@/lib/members/adjust-balance'

export function AdjustBalanceForm({ profileId }: { profileId: string }) {
  const boundAction = adjustBalanceAction.bind(null, profileId)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction} className="mt-2 flex gap-2">
      <input name="amount" type="number" step="1" placeholder="Amount (+/-)" required className="border px-2 py-1 text-sm" />
      <input name="reason" placeholder="Reason" required className="border px-2 py-1 text-sm" />
      <button type="submit">Adjust</button>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
