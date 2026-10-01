'use client'

import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

// The Settings choice, set on <html> by the root layout and flipped in place by the Settings page.
function motionSettingReduced(): boolean {
  return document.documentElement.dataset.motion === 'reduce'
}

function deviceReducesMotion(): boolean {
  return window.matchMedia(QUERY).matches
}

export function reducedMotion(): boolean {
  return motionSettingReduced() || deviceReducesMotion()
}

function subscribeToSetting(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] })
  return () => observer.disconnect()
}

function subscribeToDevice(onChange: () => void) {
  const query = window.matchMedia(QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

// Only the Settings choice: Motion and NumberFlow already follow the device setting themselves.
export function useMotionSettingReduced(): boolean {
  return useSyncExternalStore(subscribeToSetting, motionSettingReduced, () => false)
}

export function useDeviceReducesMotion(): boolean {
  return useSyncExternalStore(subscribeToDevice, deviceReducesMotion, () => false)
}
