'use client'

import Link from 'next/link'
import { useState, type ComponentProps } from 'react'

// A Link that prefetches on intent (a pointer over it, keyboard focus) rather than whenever it
// scrolls into view (#251). Every signed-in page is dynamic, so each viewport prefetch of the nav or
// a list row is a server render of its own, and nothing caches it. A finger coming down gives only
// a ~100ms head start and costs a render per tap, so only the nav, where a tap should feel like an
// app's tab bar, opts in with `prefetchOnTouch`; a list row's tap streams its skeleton first.
export function IntentLink({
  onMouseEnter,
  onTouchStart,
  onFocus,
  prefetchOnTouch = false,
  ...props
}: ComponentProps<typeof Link> & { prefetchOnTouch?: boolean }) {
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
    />
  )
}
