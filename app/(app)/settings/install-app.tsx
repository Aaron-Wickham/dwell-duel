'use client'

import { useSyncExternalStore } from 'react'
import { SectionCard } from '@/components/ui/section-card'

type Platform = 'ios' | 'android'

const HOW_TO: Record<Platform, string> = {
  ios: 'Tap Share, then Add to Home Screen.',
  android: 'Open the menu, then Install app.',
}

// Nothing here changes without a reload, so there is nothing to subscribe to. The external
// store is only how a browser-only value is read without a hydration mismatch.
const subscribe = () => () => {}

// Not built on beforeinstallprompt, which iOS never fires. The copy only covers iPhone/iPad
// and Android, so other devices get nothing. iPadOS reports itself as a Mac, so a Mac with
// a touch screen counts as an iPad. Already installed, there's nothing to say.
function platformToInstall(): Platform | null {
  if (window.matchMedia('(display-mode: standalone)').matches) return null
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return null
}

// Home's Get the app card went with the tiles (#388); Settings says how instead, for as long as
// the app isn't installed on this phone.
export function InstallApp() {
  const platform = useSyncExternalStore(subscribe, platformToInstall, () => null)
  if (!platform) return null
  return (
    <SectionCard title="Install the app" titleId="settings-install">
      <p className="text-ink2">Open DwellDuel from your home screen, like any app. {HOW_TO[platform]}</p>
    </SectionCard>
  )
}
