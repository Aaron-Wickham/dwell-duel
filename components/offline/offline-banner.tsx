'use client'

import { WifiOff } from 'lucide-react'
import { useOffline } from 'next/offline'

export const OFFLINE_COPY = 'Offline. Reconnecting…'

// Fixed just below whichever top bar is showing, so going offline or coming back moves nothing on
// the page (ST-7). The live region stays mounted while online: screen readers often skip a region
// that is inserted together with its text.
export function OfflineBanner() {
  const isOffline = useOffline()

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[calc(4rem+var(--safe-top))] z-20 md:top-[calc(72px+var(--safe-top))]"
    >
      {isOffline && (
        <p className="flex items-center gap-2.5 border-b border-line bg-gold-soft px-4 py-2 text-sm font-bold leading-[1.4] text-gold md:px-20">
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{OFFLINE_COPY}</span>
        </p>
      )}
    </div>
  )
}
