'use client'

import { useSyncExternalStore } from 'react'

// Tailwind's md, the breakpoint where the nav moves from the phone tab bar to the desktop header.
const DESKTOP_QUERY = '(min-width: 768px)'

function subscribeToDesktop(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

// The server snapshot is the phone layout; React swaps in the real match on hydration.
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeToDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  )
}
