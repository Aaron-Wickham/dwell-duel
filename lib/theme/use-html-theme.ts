'use client'

import { useSyncExternalStore } from 'react'
import { resolveTheme, type ThemeChoice } from '@/lib/theme/theme'

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

// The theme the page is showing: the root layout writes the saved choice onto <html> before any
// script runs, and Settings changes the attribute in place, so this is what the tokens follow. The
// server can't read it, so it says "system", which is also what the page shows with no choice saved.
export function useHtmlTheme(): ThemeChoice {
  return useSyncExternalStore(
    subscribe,
    () => resolveTheme(document.documentElement.dataset.theme) ?? 'system',
    () => 'system',
  )
}
