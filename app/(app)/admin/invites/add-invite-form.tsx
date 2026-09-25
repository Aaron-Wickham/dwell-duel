'use client'

import { useActionState } from 'react'
import { addInviteAction } from '@/lib/invites/actions'

export function AddInviteForm() {
  const [state, formAction] = useActionState(addInviteAction, undefined)

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-2">
      <div className="flex gap-2">
        <input name="email" type="email" required placeholder="friend@gmail.com" className="border px-2 py-1" />
        <button type="submit">Add</button>
      </div>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
