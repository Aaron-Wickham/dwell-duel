'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cardClass } from '@/components/ui/card'
import { h2Class } from '@/components/ui/page'
import { NOTIFICATIONS_HREF } from '@/components/home/onboarding-card'
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

// The installed app's counterpart to InstallCard, which never shows there: once installed, what's
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
    <section aria-labelledby="notifications-card-title" className={cn(cardClass, 'flex flex-col gap-3 p-[18px] md:p-6')}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-acc-soft text-acc-text"
        >
          <Bell className="size-6" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="notifications-card-title" className={h2Class}>
            Turn on notifications
          </h2>
          <p className="text-ink2">Know when a market you made closes, and when your bets pay.</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link
          href={NOTIFICATIONS_HREF}
          transitionTypes={['nav-forward']}
          className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'grow no-underline')}
        >
          Turn on
        </Link>
        <Button variant="quiet" size="sm" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </section>
  )
}
