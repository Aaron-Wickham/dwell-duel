'use client'

import { useActionState, useOptimistic, useState } from 'react'
import Link from 'next/link'
import { Layers } from 'lucide-react'
import NumberFlow from '@number-flow/react'
import { useSlipCount } from '@/components/app-nav/slip-count'
import { SlipPick } from '@/components/parlays/slip-pick'
import { AnimatedText } from '@/components/ui/animated-text'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Input } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { SectionCard } from '@/components/ui/section-card'
import type { SlipView } from '@/lib/parlays/get-slip'
import { formatOdds, MAX_PICKS, potentialPayout } from '@/lib/parlays/odds'
import { placeParlayAction, type PlaceParlayState } from '@/lib/parlays/place-parlay'
import { removeFromSlipAction } from '@/lib/parlays/slip-actions'

function pickCount(n: number): string {
  if (n === 0) return 'Empty'
  return `${n} ${n === 1 ? 'pick' : 'picks'} · max ${MAX_PICKS}`
}

// Owns the success message as well as the slip card: placing empties the slip and
// revalidates the page, and the message must outlive that re-render.
export function SlipForm({ slip }: { slip: SlipView }) {
  const [state, formAction] = useActionState<PlaceParlayState, FormData>(placeParlayAction, undefined)
  const [stake, setStake] = useState('')
  const stakeNumber = Number(stake)
  const showPayout = Number.isInteger(stakeNumber) && stakeNumber > 0
  // A removed pick leaves at once. The combined odds and whether the slip can be placed stay the
  // server's until the removal lands, since only the server prices the remaining legs.
  const [picks, removePick] = useOptimistic(slip.picks, (current, outcomeId: string) =>
    current.filter((p) => p.outcomeId !== outcomeId),
  )
  const { adjust } = useSlipCount()
  const hasStalePick = picks.some((p) => !p.available)

  return (
    <div className="flex flex-col gap-5 md:gap-7">
      {state?.placed && (
        <Message tone="ok">
          {`Parlay placed at ${formatOdds(state.placed.multiplierBp)}× — potential payout ${state.placed.potentialPayout} DC.`}
        </Message>
      )}
      <SectionCard
        title="Your slip"
        titleId="slip-title"
        action={<span className="text-sm text-ink2">{pickCount(picks.length)}</span>}
        className={picks.length > 0 ? 'gap-0' : undefined}
      >
        {picks.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Your slip is empty."
            action={
              <Link href="/markets" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                Browse markets
              </Link>
            }
          >
            Add picks from any open market.
          </EmptyState>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line">
              {picks.map((pick) => (
                <li key={pick.outcomeId}>
                  <SlipPick
                    pick={pick}
                    removeAction={removeFromSlipAction.bind(null, pick.outcomeId)}
                    optimisticRemove={() => {
                      removePick(pick.outcomeId)
                      adjust(-1)
                    }}
                  />
                </li>
              ))}
            </ul>
            {picks.length === 1 ? (
              <div className="flex flex-col gap-3 border-t border-line pt-4">
                <p className="text-ink2">Add at least one more pick to place a parlay.</p>
                <Link href="/markets" className={buttonVariants({ variant: 'secondary', block: true })}>
                  Browse markets
                </Link>
              </div>
            ) : (
              <form action={formAction} className="flex flex-col gap-4 border-t border-line pt-4">
                <p className="font-extrabold">
                  Combined:{' '}
                  <AnimatedText plainText={`${formatOdds(slip.multiplierBp)}×${slip.capped ? ' (capped at 20×)' : ''}`}>
                    <NumberFlow
                      value={Number(formatOdds(slip.multiplierBp))}
                      locales="en-US"
                      format={{ minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }}
                      suffix={slip.capped ? '× (capped at 20×)' : '×'}
                    />
                  </AnimatedText>
                </p>
                <Field label="Stake (DC)" htmlFor="stake">
                  <Input
                    id="stake"
                    name="stake"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    required
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    aria-invalid={Boolean(state?.formError)}
                    aria-describedby={state?.formError ? 'slip-error' : undefined}
                  />
                </Field>
                {showPayout && (
                  <p className="text-lg">
                    Potential payout:{' '}
                    <strong className="tabular-nums">
                      <AnimatedText plainText={`${potentialPayout(stakeNumber, slip.legBps)} DC`}>
                        <NumberFlow
                          value={potentialPayout(stakeNumber, slip.legBps)}
                          locales="en-US"
                          format={{ useGrouping: false }}
                          suffix=" DC"
                        />
                      </AnimatedText>
                    </strong>
                  </p>
                )}
                <FormSubmitButton
                  block
                  disabled={!slip.canPlace}
                  aria-describedby={hasStalePick ? 'slip-blocked' : undefined}
                >
                  Place parlay
                </FormSubmitButton>
                {hasStalePick && (
                  <Message tone="gold" id="slip-blocked">
                    Remove the pick that’s no longer available to place this parlay.
                  </Message>
                )}
                {state?.formError && (
                  <Message tone="error" id="slip-error">
                    {state.formError}
                  </Message>
                )}
              </form>
            )}
          </>
        )}
      </SectionCard>
    </div>
  )
}
