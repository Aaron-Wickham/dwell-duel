'use client'

import { useActionState, useTransition } from 'react'
import Link from 'next/link'
import { Ticket, X } from 'lucide-react'
import { toast } from 'sonner'
import { useSlip } from '@/components/slip/slip-provider'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { h2Class } from '@/components/ui/page'
import { StatusChip } from '@/components/ui/status-chip'
import type { SlipPick } from '@/lib/parlays/get-slip'
import { combineOdds, formatOdds, MAX_MULTIPLIER, MAX_PICKS, potentialPayout, soloPayout } from '@/lib/parlays/odds'
import { placeSlipAction, type PlaceSlipState } from '@/lib/parlays/place-slip'
import { removeFromSlipAction } from '@/lib/parlays/slip-actions'
import { haptics } from '@/lib/haptics'
import { cn } from '@/lib/utils'

function wholeDc(value: string | undefined): number | null {
  const n = Number(value)
  return value && Number.isInteger(n) && n > 0 ? n : null
}

function placedMessage(placed: NonNullable<NonNullable<PlaceSlipState>['placed']>): string {
  const parts: string[] = []
  if (placed.solos > 0) parts.push(`${placed.solos} solo bet${placed.solos === 1 ? '' : 's'}`)
  if (placed.parlay) parts.push(`a ${placed.parlay.legs}-leg parlay at ${formatOdds(placed.parlay.multiplierBp)}×`)
  return `Placed ${parts.join(' and ')}.`
}

const segmentClass = (on: boolean) =>
  cn(
    'pressable min-h-11 cursor-pointer rounded-[10px] px-3 text-[15px] font-bold disabled:cursor-not-allowed disabled:opacity-50',
    on ? 'bg-surface text-ink shadow-tab' : 'text-ink2',
  )

function PickRow({ pick, error }: { pick: SlipPick; error?: string }) {
  const { remove, setMode, stakes, setStake } = useSlip()
  const [removing, startRemove] = useTransition()
  const stakeId = `slip-stake-${pick.outcomeId}`
  const errorId = `slip-pick-error-${pick.outcomeId}`
  const noOddsId = `slip-no-odds-${pick.outcomeId}`
  const stake = wholeDc(stakes[pick.outcomeId])
  const name = `${pick.outcomeLabel}, ${pick.marketTitle}`

  return (
    <li className="flex flex-col gap-3 py-4">
      <input type="hidden" name="pick" value={`${pick.outcomeId}:${pick.parlay ? 'parlay' : 'solo'}`} />
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 grow flex-col gap-1">
          <Link href={`/markets/${pick.marketId}`} transitionTypes={['nav-forward']} className="hit-area text-sm">
            {pick.marketTitle}
          </Link>
          <span className="text-[17px] font-extrabold leading-[1.3]">{pick.outcomeLabel}</span>
        </div>
        {pick.open ? (
          pick.oddsBp !== null && <span className="text-lg font-extrabold tabular-nums">{formatOdds(pick.oddsBp)}×</span>
        ) : (
          <StatusChip tone="lost">No longer available</StatusChip>
        )}
        {/* A button, not a ToastActionForm: this row sits inside the slip's own form. */}
        <Button
          variant="quiet"
          size="sm"
          aria-label={`Remove ${name}`}
          aria-disabled={removing || undefined}
          className="px-2.5"
          onClick={() => {
            if (removing) return
            startRemove(async () => {
              haptics.tap()
              remove(pick.outcomeId)
              if (await removeFromSlipAction(pick.outcomeId)) toast.success('Removed from your slip.')
            })
          }}
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </div>

      {pick.open && (
        <>
          <div role="group" aria-label={`Bet type for ${name}`} className="grid grid-cols-2 gap-1 rounded-[12px] bg-sunk p-1">
            <button type="button" aria-pressed={!pick.parlay} className={segmentClass(!pick.parlay)} onClick={() => setMode(pick.outcomeId, false)}>
              Solo
            </button>
            <button
              type="button"
              aria-pressed={pick.parlay}
              disabled={pick.oddsBp === null && !pick.parlay}
              aria-describedby={pick.oddsBp === null ? noOddsId : undefined}
              className={segmentClass(pick.parlay)}
              onClick={() => setMode(pick.outcomeId, true)}
            >
              Parlay
            </button>
          </div>
          {pick.oddsBp === null && (
            <p id={noOddsId} className="text-sm text-ink2">
              No one has bet on this outcome yet, so it has no odds to lock into a parlay.
            </p>
          )}
          {!pick.parlay && (
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor={stakeId} className="text-[15px] font-bold">
                Stake (DC)
              </label>
              <Input
                id={stakeId}
                name={`stake:${pick.outcomeId}`}
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={stakes[pick.outcomeId] ?? ''}
                onChange={(e) => setStake(pick.outcomeId, e.target.value)}
                className="w-28"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
              />
              {stake !== null && (
                <span className="text-sm text-ink2">
                  Pays ~{soloPayout(stake, pick.outcomePool, pick.totalPool)} DC if it wins
                </span>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <Message tone="error" id={errorId}>
          {error}
        </Message>
      )}
    </li>
  )
}

export function SlipPanel() {
  const { picks, parlayStake, setParlayStake, stakes, clearStakes, setOpen } = useSlip()
  const [state, formAction] = useActionState<PlaceSlipState, FormData>(async (prev, formData) => {
    const next = await placeSlipAction(prev, formData)
    if (next?.placed) {
      toast.success(placedMessage(next.placed))
      haptics.success()
      clearStakes()
      setOpen(false)
    }
    return next
  }, undefined)

  if (picks.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h2 id="slip-title" className={h2Class}>
          Your slip
        </h2>
        <EmptyState
          icon={Ticket}
          title="Your slip is empty."
          action={
            <Link href="/markets" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Browse markets
            </Link>
          }
        >
          Add picks from any open market.
        </EmptyState>
      </div>
    )
  }

  const solos = picks.filter((p) => !p.parlay)
  const legs = picks.filter((p) => p.parlay)
  const legBps = legs.flatMap((p) => (p.oddsBp !== null ? [p.oddsBp] : []))
  const { multiplierBp, capped } = combineOdds(legBps)
  const parlayStakeDc = wholeDc(parlayStake)
  const parlayReady = legs.length === 0 || (legs.length >= 2 && legs.length <= MAX_PICKS && legBps.length === legs.length && parlayStakeDc !== null)
  const solosReady = solos.every((p) => wholeDc(stakes[p.outcomeId]) !== null)
  const allOpen = picks.every((p) => p.open)
  const betCount = solos.length + (legs.length > 0 ? 1 : 0)
  const total = solos.reduce((sum, p) => sum + (wholeDc(stakes[p.outcomeId]) ?? 0), 0) + (legs.length > 0 ? parlayStakeDc ?? 0 : 0)
  const parlayError = state?.parlayError
  const legNote =
    legs.length === 1
      ? 'A parlay needs at least 2 picks. Switch another pick to Parlay, or this one back to Solo.'
      : legs.length > MAX_PICKS
        ? `A parlay can have at most ${MAX_PICKS} picks.`
        : null

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="slip-title" className={h2Class}>
          Your slip
        </h2>
        <span className="text-sm text-ink2">
          {picks.length} {picks.length === 1 ? 'pick' : 'picks'}
        </span>
      </div>
      <p className="text-sm text-ink2">
        Each pick is a Solo bet with its own stake, or part of one Parlay that pays only if all its picks win.
      </p>
      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {picks.map((pick) => (
          <PickRow key={pick.outcomeId} pick={pick} error={state?.pickErrors?.[pick.outcomeId]} />
        ))}
      </ul>

      {legs.length > 0 && (
        <section aria-labelledby="slip-parlay-title" className="flex flex-col gap-3 rounded-card bg-sunk p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="slip-parlay-title" className="font-extrabold">
              Parlay · {legs.length} {legs.length === 1 ? 'pick' : 'picks'}
            </h3>
            {legs.length >= 2 && legBps.length === legs.length && (
              <span className="font-extrabold tabular-nums">
                {formatOdds(multiplierBp)}×{capped && ` (capped at ${MAX_MULTIPLIER}×)`}
              </span>
            )}
          </div>
          {legNote ? (
            <p className="text-sm text-ink2">{legNote}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="slip-parlay-stake" className="text-[15px] font-bold">
                Stake (DC)
              </label>
              <Input
                id="slip-parlay-stake"
                name="parlay_stake"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={parlayStake}
                onChange={(e) => setParlayStake(e.target.value)}
                className="w-28 bg-surface"
                aria-invalid={Boolean(parlayError)}
                aria-describedby={parlayError ? 'slip-parlay-error' : undefined}
              />
              {parlayStakeDc !== null && (
                <span className="text-sm text-ink2">Pays {potentialPayout(parlayStakeDc, legBps)} DC if every pick wins</span>
              )}
            </div>
          )}
          {parlayError && (
            <Message tone="error" id="slip-parlay-error">
              {parlayError}
            </Message>
          )}
        </section>
      )}

      {!allOpen && (
        <Message tone="gold" id="slip-blocked">
          Remove the picks that are no longer available to place your slip.
        </Message>
      )}
      {state?.formError && (
        <Message tone="error" id="slip-error">
          {state.formError}
        </Message>
      )}
      <FormSubmitButton
        block
        disabled={!allOpen || !solosReady || !parlayReady}
        aria-describedby={!allOpen ? 'slip-blocked' : state?.formError ? 'slip-error' : undefined}
      >
        {`Place ${betCount} ${betCount === 1 ? 'bet' : 'bets'}${total > 0 ? ` · ${total} DC` : ''}`}
      </FormSubmitButton>
    </form>
  )
}
