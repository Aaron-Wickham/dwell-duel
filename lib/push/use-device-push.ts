'use client'

import { useEffect, useState } from 'react'

export type DevicePush = 'checking' | 'on' | 'off'

async function readDevicePush(): Promise<DevicePush> {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return 'off'
  if (Notification.permission !== 'granted') return 'off'
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager?.getSubscription()
  return subscription ? 'on' : 'off'
}

// Whether this device is subscribed to push, for Home's nudges. Settings › Notifications does the
// subscribing, and also checks the endpoint is still saved; a nudge only needs a yes or no.
export function useDevicePush(): DevicePush {
  const [state, setState] = useState<DevicePush>('checking')
  useEffect(() => {
    let live = true
    readDevicePush()
      .catch((): DevicePush => 'off')
      .then((next) => {
        if (live) setState(next)
      })
    return () => {
      live = false
    }
  }, [])
  return state
}
