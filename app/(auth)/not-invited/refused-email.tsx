'use client'

import { useEffect, useState } from 'react'

// Shows the account the callback refused, kept in state so it stays on screen after the cookie
// that carried it is cleared.
export function RefusedEmail({ email }: { email: string | null }) {
  const [shown] = useState(email)
  useEffect(() => {
    if (!email) return
    fetch('/not-invited/clear', { method: 'POST' }).catch(() => {})
  }, [email])
  if (!shown) return null
  return (
    <p className="break-words">
      You signed in as <strong>{shown}</strong>.
    </p>
  )
}
