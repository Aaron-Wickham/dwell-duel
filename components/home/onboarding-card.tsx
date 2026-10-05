'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TAB_TRANSITION } from '@/components/nav/page-transition'
import { Check } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cardClass, cardPaddingClass } from '@/components/ui/card'
import { h2Class } from '@/components/ui/page'
import { dismissOnboardingAction } from '@/lib/home/dismiss-onboarding'
import type { OnboardingSteps } from '@/lib/home/onboarding'
import { useDevicePush } from '@/lib/push/use-device-push'
import { focusPageHeading } from '@/lib/ui/focus-page-heading'
import { cn } from '@/lib/utils'

type StepKey = keyof OnboardingSteps | 'notify'

export const NOTIFICATIONS_HREF = '/settings#settings-notifications'

// How it works comes first, so a new member knows what a Dwell Coin is before spending one (#260).
const STEPS: {
  key: StepKey
  title: string
  hint: string
  cta: string
  href: string
  drillDown?: boolean
}[] = [
  { key: 'learn', title: 'Learn how DwellDuel works', hint: 'Betting, parlays and earning DC, in short.', cta: 'Read', href: '/how-it-works', drillDown: true },
  // Settings handles every device state (not installed on iOS, unsupported, blocked), so the step
  // only points there.
  { key: 'notify', title: 'Turn on notifications', hint: 'Hear when your markets close and your bets pay.', cta: 'Turn on', href: NOTIFICATIONS_HREF, drillDown: true },
  { key: 'photo', title: 'Add your photo', hint: 'So everyone knows who’s betting.', cta: 'Add photo', href: '/profile', drillDown: true },
  { key: 'bet', title: 'Place your first bet', hint: 'Add an outcome to your slip, then place it.', cta: 'Find a market', href: '/markets' },
  { key: 'task', title: 'Try a task', hint: 'Earn DC with Bible study.', cta: 'See tasks', href: '/tasks' },
]

export function OnboardingCard({ steps }: { steps: OnboardingSteps | null }) {
  const [dismissed, setDismissed] = useState(false)
  const push = useDevicePush()
  if (!steps || dismissed) return null

  // A browser that can never get push has no notifications step to finish.
  const shown = push === 'unsupported' ? STEPS.filter((step) => step.key !== 'notify') : STEPS
  const done = (key: StepKey) => (key === 'notify' ? push === 'on' : steps[key])
  const doneCount = shown.filter((step) => done(step.key)).length
  if (doneCount === shown.length) return null

  function dismiss() {
    setDismissed(true)
    focusPageHeading()?.focus()
    // Hiding it isn't a money action, so it needn't wait. If the cookie fails to save, the card
    // is only gone for this visit and comes back next time, which is harmless.
    dismissOnboardingAction().catch(() => {})
  }

  return (
    <section aria-labelledby="onboarding-title" className={cn(cardClass, `flex flex-col gap-3 ${cardPaddingClass}`)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="onboarding-title" className={h2Class}>
            Getting started
          </h2>
          <p className="text-ink2">
            {doneCount} of {shown.length} done
          </p>
        </div>
        <Button variant="quiet" size="sm" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
      <ol className="flex flex-col divide-y divide-line">
        {shown.map((step, index) => {
          const stepDone = done(step.key)
          return (
            <li key={step.key} data-step={step.key} className="flex min-h-16 items-center gap-3 py-2.5">
              {stepDone ? (
                <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime text-on-lime">
                  <Check className="size-4" strokeWidth={2.6} />
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-line-s text-xs font-extrabold text-ink2"
                >
                  {index + 1}
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className={cn('font-extrabold', stepDone && 'text-ink2 line-through')}>{step.title}</span>
                {stepDone ? <span className="sr-only">Done</span> : <span className="text-sm text-ink2">{step.hint}</span>}
              </div>
              {!stepDone && (
                <Link
                  href={step.href}
                  transitionTypes={step.drillDown ? ['nav-forward'] : TAB_TRANSITION}
                  className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'shrink-0 no-underline')}
                >
                  {step.cta}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
