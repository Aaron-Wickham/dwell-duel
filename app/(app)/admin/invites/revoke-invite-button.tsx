'use client'

import { useActionState } from 'react'
import { revokeInviteAction } from '@/lib/invites/actions'

export function RevokeInviteButton({ email }: { email: string }) {
  const [state, formAction] = useActionState(revokeInviteAction, undefined)

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <div>
        <input type="hidden" name="email" value={email} />
        <button type="submit">Revoke</button>
      </div>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
