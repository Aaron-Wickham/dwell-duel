'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Circle, CircleCheck } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cardClass } from '@/components/ui/card'
import { h2Class } from '@/components/ui/page'
import { dismissOnboardingAction } from '@/lib/home/dismiss-onboarding'
import type { OnboardingSteps } from '@/lib/home/onboarding'
import { focusPageHeading } from '@/lib/ui/focus-page-heading'
import { cn } from '@/lib/utils'

const STEPS: {
  key: keyof OnboardingSteps
  title: string
  hint: string
  cta: string
  href: string
  drillDown?: boolean
}[] = [
  { key: 'photo', title: 'Add your photo', hint: 'So everyone knows who’s betting.', cta: 'Add photo', href: '/profile', drillDown: true },
  { key: 'bet', title: 'Place your first bet', hint: 'Add an outcome to your slip, then place it.', cta: 'Find a market', href: '/markets' },
  { key: 'task', title: 'Try a task', hint: 'Earn DC with Bible study.', cta: 'See tasks', href: '/tasks' },
]

export function OnboardingCard({ steps }: { steps: OnboardingSteps | null }) {
  const [dismissed, setDismissed] = useState(false)
  if (!steps || dismissed) return null

  const doneCount = STEPS.filter((step) => steps[step.key]).length
  if (doneCount === STEPS.length) return null

  function dismiss() {
    setDismissed(true)
    focusPageHeading()?.focus()
    // Hiding it isn't a money action, so it needn't wait. If the cookie fails to save, the card
    // is only gone for this visit and comes back next time, which is harmless.
    dismissOnboardingAction().catch(() => {})
  }

  return (
    <section aria-labelledby="onboarding-title" className={cn(cardClass, 'flex flex-col gap-3 p-[18px] md:p-6')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="onboarding-title" className={h2Class}>
            Getting started
          </h2>
          <p className="text-ink2">
            {doneCount} of {STEPS.length} done
          </p>
        </div>
        <Button variant="quiet" size="sm" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
      <ol className="flex flex-col divide-y divide-line">
        {STEPS.map((step) => {
          const done = steps[step.key]
          const Icon = done ? CircleCheck : Circle
          return (
            <li key={step.key} data-step={step.key} className="flex min-h-16 items-center gap-3 py-2.5">
              <Icon aria-hidden="true" className={cn('size-6 shrink-0', done ? 'text-win' : 'text-ink2')} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-extrabold">{step.title}</span>
                <span className="text-sm text-ink2">{done ? 'Done' : step.hint}</span>
              </div>
              {!done && (
                <Link
                  href={step.href}
                  transitionTypes={step.drillDown ? ['nav-forward'] : undefined}
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
