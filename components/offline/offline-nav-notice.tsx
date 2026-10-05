'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useOffline } from 'next/offline'

export const OFFLINE_NAV_COPY = 'You’re offline. That page opens once you’re back online.'

// experimental.useOffline holds a navigation made offline and retries it on reconnect, which on
// screen is a tap that does nothing (ST-7). This answers the tap at once instead; the navigation
// itself still completes when the connection returns. One toast id, so repeated taps don't stack.
export function OfflineNavNotice() {
  const isOffline = useOffline()
  const offlineRef = useRef(isOffline)
  useEffect(() => {
    offlineRef.current = isOffline
    if (!isOffline) toast.dismiss('offline-nav')
  }, [isOffline])

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!offlineRef.current && navigator.onLine) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.('a[href]')
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download')) return
      const url = new URL(link.href, location.href)
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return
      toast(OFFLINE_NAV_COPY, { id: 'offline-nav' })
    }
    // Capture, so it runs before next/link's own handler takes the click over.
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return null
}
