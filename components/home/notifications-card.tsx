'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { cardClass, cardPaddingClass } from '@/components/ui/card'
import { h2Class } from '@/components/ui/page'
import { NOTIFICATIONS_HREF, NOTIFICATIONS_PROMISE } from '@/components/home/onboarding-card'
import { useDevicePush } from '@/lib/push/use-device-push'
import { focusPageHeading } from '@/lib/ui/focus-page-heading'
import { cn } from '@/lib/utils'

export const NOTIFICATIONS_CARD_DISMISSED_KEY = 'dwellduel:notifications-card-dismissed'

const subscribe = () => () => {}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(NOTIFICATIONS_CARD_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

// The installed app's nudge (a browser tab gets Settings' Install the app instead): once installed, what's
// left is turning on push, which Markets to resolve depends on (#260). While Getting started is up,
// its own step asks instead, so this waits until that card has been dismissed.
function shouldNudge(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches && !wasDismissed()
}

export function NotificationsCard({ onboardingShown }: { onboardingShown: boolean }) {
  const eligible = useSyncExternalStore(subscribe, shouldNudge, () => false)
  const push = useDevicePush()
  const [dismissed, setDismissed] = useState(false)

  if (onboardingShown || !eligible || push !== 'off' || dismissed) return null

  function dismiss() {
    try {
      localStorage.setItem(NOTIFICATIONS_CARD_DISMISSED_KEY, '1')
    } catch {
      // Storage can be unavailable (e.g. private browsing); the card still hides for this visit.
    }
    setDismissed(true)
    focusPageHeading()?.focus()
  }

  return (
    <section aria-labelledby="notifications-card-title" className={cn(cardClass, `flex flex-col gap-3 ${cardPaddingClass}`)}>
      <div className="flex flex-col gap-1">
        <h2 id="notifications-card-title" className={h2Class}>
          Turn on notifications
        </h2>
        <p className="text-ink2">{NOTIFICATIONS_PROMISE}</p>
      </div>
      <div className="flex gap-2">
        <Link
          href={NOTIFICATIONS_HREF}
          transitionTypes={['nav-forward']}
          className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'grow no-underline')}
        >
          Turn on
        </Link>
        {/* It never comes back on this device, so the button says so (C-12). */}
        <Button variant="quiet" size="sm" onClick={dismiss}>
          Don’t show again
        </Button>
      </div>
    </section>
  )
}
