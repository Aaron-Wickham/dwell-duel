'use client'

import type { CSSProperties } from 'react'
import { CircleCheck } from 'lucide-react'
import { Toaster as SonnerToaster } from 'sonner'
import { useIsDesktop } from '@/lib/ui/use-is-desktop'

// Sonner's own "mobile" layout switches at a fixed 600px baked into its stylesheet. This
// app's nav switches at Tailwind's md (768px) instead, so the toaster's position is
// driven from JS against that same breakpoint rather than sonner's built-in one. Phone
// keeps the toast at the TOP, below the 64px top bar: a floating "Slip (n)" button sits
// just above the bottom tab bar, and a bottom toast would cover it right after a pick is
// added. In the installed app the top bar sits below the status band, so the phone offset
// grows by --safe-top. On desktop the same button floats bottom-right, so toasts stack above it.
const PHONE_OFFSET = { top: 'calc(80px + var(--safe-top))', left: 16, right: 16 }

export function Toaster() {
  const isDesktop = useIsDesktop()
  return (
    <SonnerToaster
      position={isDesktop ? 'bottom-right' : 'top-center'}
      gap={12}
      richColors
      offset={isDesktop ? { bottom: 96, right: 32 } : PHONE_OFFSET}
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
