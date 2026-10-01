'use client'

import { useEffect } from 'react'
import { savePushSubscriptionAction } from '@/lib/push/actions'
import { resyncPushSubscription } from '@/lib/push/client'

// The worker registers on every production page load; don't wait for one that never will.
const READY_TIMEOUT_MS = 10_000

export function PushResync({ userId, publicKey }: { userId: string; publicKey: string }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    let cancelled = false
    ;(async () => {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), READY_TIMEOUT_MS)),
      ])
      if (cancelled) return
      await resyncPushSubscription({
        userId,
        publicKey,
        permission: Notification.permission,
        storage: localStorage,
        now: Date.now(),
        registration,
        save: savePushSubscriptionAction,
      })
    })().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [userId, publicKey])

  return null
}
