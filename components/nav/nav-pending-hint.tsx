'use client'

import { useLinkStatus } from 'next/link'
import { cn } from '@/lib/utils'

// Always rendered, so a pending navigation never shifts the layout. app/globals.css holds it
// invisible until the navigation has taken longer than a prefetched one would.
export function NavPendingHint({ className }: { className?: string }) {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden="true"
      data-pending={pending ? '' : undefined}
      className={cn('nav-pending-hint pointer-events-none absolute rounded-full bg-current', className)}
    />
  )
}
