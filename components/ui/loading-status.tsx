'use client'

import { useEffect, useState } from 'react'

// A page that streams several sections behind independent Suspense boundaries (the market page's
// chart, outcomes, bet form and bets) can have more than one pending at once. Each one used to
// carry its own SkeletonScreen status; mounted once per page instead, this announces exactly one,
// for as long as any [data-skeleton] fallback is still in the DOM, and clears itself once every
// section has resolved and swapped its fallback for real content.
export function LoadingStatus() {
  // Starts pending so the server-rendered first flush, where the fallbacks are showing, already
  // announces it before hydration; the first check clears it if nothing is pending.
  const [pending, setPending] = useState(true)

  useEffect(() => {
    const check = () => setPending(document.querySelectorAll('[data-skeleton]').length > 0)
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return (
    <p role="status" className="sr-only">
      {pending ? 'Loading…' : ''}
    </p>
  )
}
