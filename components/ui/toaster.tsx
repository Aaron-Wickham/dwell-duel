'use client'

import type { CSSProperties } from 'react'
import { useSyncExternalStore } from 'react'
import { CircleCheck } from 'lucide-react'
import { Toaster as SonnerToaster } from 'sonner'

// Sonner's own "mobile" layout switches at a fixed 600px baked into its stylesheet. This
// app's nav switches at Tailwind's md (768px) instead, so the toaster's position is
// driven from JS against that same breakpoint rather than sonner's built-in one. Phone
// keeps the toast at the TOP, below the 64px top bar: Task 7 adds a floating "Slip (n)"
// button just above the bottom tab bar, and a bottom toast would cover it right after a
// pick is added. In the installed app the top bar sits below the status band, so the phone
// offset grows by --safe-top.
const DESKTOP_QUERY = '(min-width: 768px)'

function subscribeToDesktop(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

// The server snapshot is the phone layout; React swaps in the real match on hydration.
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeToDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  )
}

const PHONE_OFFSET = { top: 'calc(80px + var(--safe-top))', left: 16, right: 16 }

export function Toaster() {
  const isDesktop = useIsDesktop()
  return (
    <SonnerToaster
      position={isDesktop ? 'bottom-right' : 'top-center'}
      gap={12}
      richColors
      offset={isDesktop ? { bottom: 24, right: 24 } : PHONE_OFFSET}
      mobileOffset={PHONE_OFFSET}
      icons={{ success: <CircleCheck aria-hidden="true" className="size-4" /> }}
      toastOptions={{ style: { boxShadow: 'var(--shadow-overlay)' } }}
      style={
        {
          fontFamily: 'var(--font-manrope), ui-sans-serif, system-ui, sans-serif',
          '--border-radius': 'var(--radius-control)',
          '--normal-bg': 'var(--surface)',
          '--normal-border': 'var(--line)',
          '--normal-text': 'var(--ink)',
          '--success-bg': 'var(--acc-soft)',
          '--success-border': 'var(--acc-soft)',
          '--success-text': 'var(--acc-text)',
        } as CSSProperties
      }
    />
  )
}
