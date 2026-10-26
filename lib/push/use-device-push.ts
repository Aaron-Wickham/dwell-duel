'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

// unsupported: this browser can never get push, so there's nothing to ask for. Safari on an iPhone
// or iPad that hasn't installed the app reads as off instead: installing it is the way to turn
// them on, and Settings says so. A blocked permission is off too; Settings says how to allow it.
export type DevicePush = 'checking' | 'on' | 'off' | 'unsupported'

function iosNotInstalled(): boolean {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return ios && !window.matchMedia('(display-mode: standalone)').matches
}

// What the browser can say at once (HOME-4): whether push exists here and whether it's allowed.
// Only a granted permission needs the asynchronous subscription check, so only then is it checking.
function readSync(): DevicePush {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return iosNotInstalled() ? 'off' : 'unsupported'
  }
  return Notification.permission === 'granted' ? 'checking' : 'off'
}

async function readSubscribed(): Promise<DevicePush> {
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager?.getSubscription()
  return subscription ? 'on' : 'off'
}

const subscribe = () => () => {}

// Whether this device is subscribed to push, for Home's nudges. Settings › Notifications does the
// subscribing, and also checks the endpoint is still saved; a nudge only needs a yes or no. The
// server can't know, so it renders checking, and the browser's first render already has the answer
// unless a subscription has to be looked up.
export function useDevicePush(): DevicePush {
  const now = useSyncExternalStore(subscribe, readSync, () => 'checking' as const)
  const [subscribed, setSubscribed] = useState<DevicePush | null>(null)
  const needsLookup = now === 'checking'
  useEffect(() => {
    if (!needsLookup) return
    let live = true
    readSubscribed()
      .catch((): DevicePush => 'off')
      .then((next) => {
        if (live) setSubscribed(next)
      })
    return () => {
      live = false
    }
  }, [needsLookup])
  return needsLookup ? (subscribed ?? 'checking') : now
}
