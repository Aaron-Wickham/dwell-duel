'use client'

import Link, { useLinkStatus } from 'next/link'
import { useState, type ComponentProps } from 'react'

// While the tapped link's page is on the way, globals.css dims the card or control that holds this
// (#384), so a tap on a slow connection shows at once that it landed. A prefetched or cached page
// is never pending, so it never flashes.
function PendingMarker() {
  const { pending } = useLinkStatus()
  return pending ? <span hidden data-link-pending="" /> : null
}

// A Link that prefetches on intent (a pointer over it, keyboard focus) rather than whenever it
// scrolls into view (#251). Every signed-in page is dynamic, so each viewport prefetch of the nav or
// a list row is a server render of its own. A finger coming down gives only a ~100ms head start and
// costs a render per tap, so only the nav, where a tap should feel like an app's tab bar, opts in
// with `prefetchOnTouch`; a list row's tap shows its pending dim and then its skeleton. The nav
// passes `pendingMarker={false}`: its pill moves to the tapped tab instead.
export function IntentLink({
  onMouseEnter,
  onTouchStart,
  onFocus,
  prefetchOnTouch = false,
  pendingMarker = true,
  children,
  ...props
}: ComponentProps<typeof Link> & { prefetchOnTouch?: boolean; pendingMarker?: boolean }) {
  const [intent, setIntent] = useState(false)
  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={(event) => {
        setIntent(true)
        onMouseEnter?.(event)
      }}
      onTouchStart={(event) => {
        if (prefetchOnTouch) setIntent(true)
        onTouchStart?.(event)
      }}
      onFocus={(event) => {
        setIntent(true)
        onFocus?.(event)
      }}
    >
      {children}
      {pendingMarker && <PendingMarker />}
    </Link>
  )
}
