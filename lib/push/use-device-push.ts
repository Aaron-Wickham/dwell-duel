'use client'

import { useEffect, useState } from 'react'

// unsupported: this browser can never get push, so there's nothing to ask for. Safari on an iPhone
// or iPad that hasn't installed the app reads as off instead: installing it is the way to turn
// them on, and Settings says so. A blocked permission is off too; Settings says how to allow it.
export type DevicePush = 'checking' | 'on' | 'off' | 'unsupported'

function iosNotInstalled(): boolean {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return ios && !window.matchMedia('(display-mode: standalone)').matches
}

async function readDevicePush(): Promise<DevicePush> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return iosNotInstalled() ? 'off' : 'unsupported'
  }
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
