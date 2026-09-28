'use client'

import { useCallback, useRef, useSyncExternalStore, type ReactNode } from 'react'

// A page that streams several sections behind independent Suspense boundaries (the market page's
// chart, outcomes, bet form and bets) can have more than one pending at once. Each one used to
// carry its own SkeletonScreen status; wrapped around those sections instead, this announces
// exactly one, for as long as any of its own [data-skeleton] fallbacks is still in the DOM, and
// clears itself once every section has resolved and swapped its fallback for real content.
//
// The check is scoped to this wrapper's own subtree (via ref), not the whole document: an
// outgoing page's skeleton can still be fading out elsewhere in the DOM during the very
// navigation that mounts this one (SkeletonReveal/RouteTransition animate the exit rather than
// unmounting instantly), and an unrelated [data-skeleton] anywhere else on the page must not
// count either. display: contents keeps the wrapped sections' own grid placement working as if
// this wrapper weren't there.
export function LoadingStatus({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  // Stable across renders (useSyncExternalStore resubscribes whenever subscribe changes), and
  // reads the ref fresh on every call rather than closing over a stale node.
  const subscribe = useCallback((onStoreChange: () => void) => {
    const node = ref.current
    if (!node) return () => {}
    const observer = new MutationObserver(onStoreChange)
    observer.observe(node, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const getSnapshot = () => (ref.current ? ref.current.querySelector('[data-skeleton]') !== null : false)
  // The server has no DOM to check, and its markup is the fallbacks, so it always announces.
  const getServerSnapshot = () => true

  const pending = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return (
    <div ref={ref} className="contents">
      <p role="status" className="sr-only">
        {pending ? 'Loading…' : ''}
      </p>
      {children}
    </div>
  )
}
