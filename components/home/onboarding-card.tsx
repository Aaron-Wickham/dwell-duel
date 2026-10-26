'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { TAB_TRANSITION } from '@/components/nav/page-transition'
import { Check } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cardClass, cardPaddingClass } from '@/components/ui/card'
import { h2Class } from '@/components/ui/page'
import { dismissOnboardingAction, restoreOnboardingAction } from '@/lib/home/dismiss-onboarding'
import type { OnboardingSteps } from '@/lib/home/onboarding'
import { useDevicePush } from '@/lib/push/use-device-push'
import { focusPageHeading } from '@/lib/ui/focus-page-heading'
import { cn } from '@/lib/utils'

type StepKey = keyof OnboardingSteps | 'notify'

export const NOTIFICATIONS_HREF = '/settings#settings-notifications'

// One line for what notifications are for, in this step and in Turn on notifications (C-13).
export const NOTIFICATIONS_PROMISE = 'Hear when a market you created closes and when your bets pay.'

// Long enough to reach Undo after a stray tap; other toasts keep Sonner's 4 seconds.
const UNDO_TOAST_DURATION_MS = 8_000

// When Undo was pressed. Dismissing saves a cookie, so Next re-renders Home without this card and
// unmounts it; Undo's own cookie change brings back a fresh one, which reads this to take focus.
// It isn't used up by the first card to see it: the instance that survived the dismissal can see
// it and then be replaced by the server's fresh card, which must see it too. It goes stale
// quickly, so a card mounted much later never grabs focus.
let restoredAt = 0
const RESTORE_FOCUS_WINDOW_MS = 5_000

function restoreFocusPending(): boolean {
  return Date.now() - restoredAt < RESTORE_FOCUS_WINDOW_MS
}

// Runs once the restore has landed. If the card is on screen it takes focus and the flag is
// spent; if the fresh card is still streaming in, the flag waits for its mount.
function focusRestoredHeading() {
  const heading = restoreFocusPending() ? document.getElementById('onboarding-title') : null
  if (!heading) return
  heading.focus()
  restoredAt = 0
}

// How it works comes first, so a new member knows what a Dwell Coin is before spending one (#260).
const STEPS: {
  key: StepKey
  title: string
  hint: string
  cta: string
  href: string
  drillDown?: boolean
}[] = [
  { key: 'learn', title: 'Learn how DwellDuel works', hint: 'Betting, parlays and earning DC, in short.', cta: 'Read the basics', href: '/how-it-works', drillDown: true },
  // Settings handles every device state (not installed on iOS, unsupported, blocked), so the step
  // only points there.
  { key: 'notify', title: 'Turn on notifications', hint: NOTIFICATIONS_PROMISE, cta: 'Turn on', href: NOTIFICATIONS_HREF, drillDown: true },
  { key: 'photo', title: 'Add your photo', hint: 'So everyone knows who’s betting.', cta: 'Add photo', href: '/profile', drillDown: true },
  { key: 'bet', title: 'Place your first bet', hint: 'Add a pick to your slip, then place it.', cta: 'Find a market', href: '/markets' },
  { key: 'task', title: 'Try a task', hint: 'Earn DC with Bible study.', cta: 'See tasks', href: '/tasks' },
]

export function OnboardingCard({ steps }: { steps: OnboardingSteps | null }) {
  const [dismissed, setDismissed] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const push = useDevicePush()
  const shownNow = Boolean(steps) && !dismissed

  // After Undo the card comes back where it was, and focus with it, rather than staying on the
  // page's h1, whether this instance survived the dismissal or a fresh one has just mounted.
  useEffect(() => {
    if (shownNow && headingRef.current && restoreFocusPending()) headingRef.current.focus()
  }, [shownNow])

  if (!steps || dismissed) return null

  // A browser that can never get push has no notifications step to finish. Until a granted
  // permission's subscription has been looked up, that step and the count are held (HOME-4), so
  // "2 of 5" doesn't jump to "3 of 5" as the page settles.
  const checking = push === 'checking'
  const shown = push === 'unsupported' ? STEPS.filter((step) => step.key !== 'notify') : STEPS
  const done = (key: StepKey) => (key === 'notify' ? push === 'on' : steps[key])
  const doneCount = shown.filter((step) => done(step.key)).length
  if (!checking && doneCount === shown.length) return null

  function restore() {
    restoredAt = Date.now()
    setDismissed(false)
    // Once the action's re-render has landed, the card on screen may be a fresh one.
    restoreOnboardingAction()
      .then(() => requestAnimationFrame(focusRestoredHeading))
      .catch(() => {})
  }

  function dismiss() {
    setDismissed(true)
    focusPageHeading()?.focus()
    // Hiding it isn't a money action, so it needn't wait. If the cookie fails to save, the card
    // is only gone for this visit and comes back next time, which is harmless.
    dismissOnboardingAction().catch(() => {})
    toast('Getting started hidden', {
      id: 'onboarding-dismissed',
      duration: UNDO_TOAST_DURATION_MS,
      action: { label: 'Undo', onClick: restore },
    })
  }

  return (
    <section aria-labelledby="onboarding-title" className={cn(cardClass, `flex flex-col gap-3 ${cardPaddingClass}`)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="onboarding-title" ref={headingRef} tabIndex={-1} className={h2Class}>
            Getting started
          </h2>
          <p className={cn('text-ink2', checking && 'invisible')}>
            {doneCount} of {shown.length} done
          </p>
        </div>
        <Button variant="quiet" size="sm" onClick={dismiss} aria-label="Dismiss getting started">
          Dismiss
        </Button>
      </div>
      <ol className="flex flex-col divide-y divide-line">
        {shown.map((step, index) => {
          const stepDone = done(step.key)
          const held = checking && step.key === 'notify'
          return (
            <li
              key={step.key}
              data-step={step.key}
              aria-busy={held || undefined}
              className={cn('flex min-h-16 items-center gap-3 py-2.5', held && '[&>*]:invisible')}
            >
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
                <span id={`onboarding-step-${step.key}`} className={cn('font-extrabold', stepDone && 'text-ink2 line-through')}>
                  {step.title}
                </span>
                {stepDone ? <span className="sr-only">Done</span> : <span className="text-sm text-ink2">{step.hint}</span>}
              </div>
              {!stepDone && (
                <Link
                  href={step.href}
                  transitionTypes={step.drillDown ? ['nav-forward'] : TAB_TRANSITION}
                  aria-describedby={`onboarding-step-${step.key}`}
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
