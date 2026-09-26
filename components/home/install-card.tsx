'use client'

import { useState, useSyncExternalStore } from 'react'
import { Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cardClass } from '@/components/ui/card'
import { h2Class } from '@/components/ui/page'
import { focusPageHeading } from '@/lib/ui/focus-page-heading'
import { cn } from '@/lib/utils'

export const INSTALL_CARD_DISMISSED_KEY = 'dwellduel:install-card-dismissed'

type Platform = 'ios' | 'android'

const HOW_TO: Record<Platform, string> = {
  ios: 'Tap Share, then Add to Home Screen.',
  android: 'Open the menu, then Install app.',
}

// Nothing here changes without a reload, so there is nothing to subscribe to. The external
// store is only how a browser-only value is read without a hydration mismatch.
const subscribe = () => () => {}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_CARD_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

// Not built on beforeinstallprompt, which iOS never fires. The copy only covers iPhone/iPad
// and Android, so other devices get no card. iPadOS reports itself as a Mac, so a Mac with
// a touch screen counts as an iPad.
function platformToNudge(): Platform | null {
  if (window.matchMedia('(display-mode: standalone)').matches) return null
  if (wasDismissed()) return null
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return null
}

export function InstallCard() {
  const platform = useSyncExternalStore(subscribe, platformToNudge, () => null)
  const [dismissed, setDismissed] = useState(false)

  if (!platform || dismissed) return null

  function dismiss() {
    try {
      localStorage.setItem(INSTALL_CARD_DISMISSED_KEY, '1')
    } catch {
      // Storage can be unavailable (e.g. private browsing); the card still hides for this visit.
    }
    setDismissed(true)
    focusPageHeading()?.focus()
  }

  return (
    <section aria-labelledby="install-card-title" className={cn(cardClass, 'flex items-start gap-4 p-[18px] md:p-6')}>
      <span
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-acc-soft text-acc-text"
      >
        <Smartphone className="size-6" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="install-card-title" className={h2Class}>
            Get the app
          </h2>
          <p className="text-ink2">{HOW_TO[platform]}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </section>
  )
}
