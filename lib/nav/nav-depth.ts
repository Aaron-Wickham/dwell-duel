'use client'

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'

// The count is stored on each history entry itself (window.history.state.ddDepth), not derived
// from history.length: length also counts entries from before the app loaded and never shrinks
// on back, and a single popstate can skip straight past several entries (the long-press back
// menu, history.go(-n)), so only the landed-on entry's own stored count can be trusted. Mounting
// reads that entry's ddDepth, so a reload inside the app keeps its depth; a fresh load or a deep
// link with no stored depth starts at 0.
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

function storedDepth(): number {
  const stored = window.history.state?.ddDepth
  return typeof stored === 'number' ? stored : 0
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

  // A new page opens at its top (#349). Next scrolls only when the changed segment starts off
  // screen, so a page scrolled a little, or an admin section under the shared header, kept the old
  // offset. Back and forward keep the position the browser restores; a #hash keeps its target.
  // A layout effect, so the new page never paints at the old offset; it runs before the effect
  // below consumes popPending.
  useLayoutEffect(() => {
    if (previous.current === null || previous.current === pathname) return
    if (popPending || window.location.hash) return
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])

  useEffect(() => {
    if (previous.current === null) {
      previous.current = pathname
      setDepth(storedDepth())
      return
    }
    if (previous.current === pathname) return
    previous.current = pathname

    if (popPending) {
      popPending = false
      // The browser already restored the landed-on entry's own state before firing popstate, so
      // its stored count is trusted directly rather than assuming a single step back or forward
      // (popstate can't tell the two apart either).
      setDepth(storedDepth())
    } else {
      // Every push navigation in the app goes through here. The admin-gate redirect is the one
      // replace navigation on the client path, and non-admins never reach it from a link, so it
      // never inflates a count a link-driven back-swipe would rely on.
      const next = depth + 1
      setDepth(next)
      window.history.replaceState({ ...window.history.state, ddDepth: next }, '')
    }
  }, [pathname])

  return null
}
