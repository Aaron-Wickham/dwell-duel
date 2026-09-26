'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'

// history.length also counts entries from before the app loaded and never shrinks on back, so
// the app keeps its own count. It lives in module scope: a full reload starts it again at 0.
let depth = 0
let popPending = false
const listeners = new Set<() => void>()

function setDepth(next: number) {
  depth = Math.max(0, next)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useNavDepth(): number {
  return useSyncExternalStore(
    subscribe,
    () => depth,
    () => 0,
  )
}

export function NavDepthTracker(): null {
  const pathname = usePathname()
  const previous = useRef<string | null>(null)

  useEffect(() => {
    function onPopState() {
      // A hash or search-only traversal fires popstate without changing the pathname.
      if (window.location.pathname !== previous.current) popPending = true
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (previous.current === null || previous.current === pathname) {
      previous.current = pathname
      return
    }
    previous.current = pathname
    if (popPending) {
      popPending = false
      setDepth(depth - 1)
    } else {
      setDepth(depth + 1)
    }
  }, [pathname])

  return null
}
