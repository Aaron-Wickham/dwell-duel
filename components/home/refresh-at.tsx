'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Past about 24.8 days (2^31 - 1 ms) setTimeout overflows and fires at once, so a far-off time
// is reached in hops.
const MAX_TIMEOUT_MS = 2 ** 31 - 1
// Lands after the moment itself, so the server's clock has passed it too when it re-renders.
const GRACE_MS = 2000

// Refreshes the page's server data once `at` has passed. A hidden tab waits until it's shown
// again, rather than refreshing a page nobody is looking at.
export function RefreshAt({ at }: { at: string | null }) {
  const router = useRouter()

  useEffect(() => {
    if (!at) return
    const due = Date.parse(at) + GRACE_MS
    if (Number.isNaN(due)) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let refreshed = false

    const check = () => {
      clearTimeout(timer)
      if (refreshed) return
      const wait = due - Date.now()
      if (wait > 0) {
        timer = setTimeout(check, Math.min(wait, MAX_TIMEOUT_MS))
        return
      }
      if (document.visibilityState !== 'visible') return
      refreshed = true
      router.refresh()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check()
    }

    check()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [at, router])

  return null
}
