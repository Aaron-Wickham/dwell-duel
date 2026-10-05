'use client'

import { WifiOff } from 'lucide-react'
import { useOffline } from 'next/offline'
import { cn } from '@/lib/utils'

export const OFFLINE_COPY = 'Offline. Reconnecting…'

const stripClass = 'flex items-center gap-2.5 border-b border-line bg-gold-soft px-4 py-2 text-sm font-bold leading-[1.4] text-gold md:px-20'

// Fixed just below whichever top bar is showing, so it stays in view as the page scrolls. The
// signed-in layout renders it outside #app-shell, so it isn't made inert while the slip is open,
// and the explicit aria-live keeps Base UI from hiding it from screen readers then. The live
// region stays mounted while online: screen readers often skip a region that is inserted together
// with its text. OfflineSpacer, in the page's flow, keeps it off the page's title (#401).
export function OfflineBanner() {
  const isOffline = useOffline()

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(4rem+var(--safe-top))] z-20 md:top-[calc(72px+var(--safe-top))]"
    >
      {isOffline && (
        <p className={stripClass}>
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{OFFLINE_COPY}</span>
        </p>
      )}
    </div>
  )
}

// An invisible copy of the strip at the top of <main> while it shows, pushing the page down by
// exactly its height so the strip never covers the title: one deliberate shift on going offline,
// and one back.
export function OfflineSpacer() {
  const isOffline = useOffline()
  if (!isOffline) return null
  return (
    <p aria-hidden="true" data-slot="offline-spacer" className={cn(stripClass, 'invisible')}>
      <WifiOff className="size-4 shrink-0" />
      <span className="truncate">{OFFLINE_COPY}</span>
    </p>
  )
}
