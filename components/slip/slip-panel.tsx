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
import {
  combineOdds,
  formatOdds,
  legOddsBp,
  MAX_LEG_ODDS,
  MAX_MULTIPLIER,
  MAX_PAYOUT,
  MAX_PICKS,
  MIN_LEG_BETTORS,
  MIN_LEG_POOL,
  potentialPayout,
  soloPayout,
} from '@/lib/parlays/odds'
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
  if (placed.parlay) parts.push(`a ${placed.parlay.legs}-leg parlay at ~${formatOdds(placed.parlay.multiplierBp)}×`)
  if (placed.replayed) {
    return parts.length > 0
      ? `Your earlier attempt already went through: ${parts.join(' and ')}.`
      : 'Your earlier attempt already went through.'
  }
  return `Placed ${parts.join(' and ')}.`
}

const QUICK_STAKES = [5, 10, 25]

// A parlay stake only counts once there's a parlay to place: a lone Parlay pick has no stake field,
// so a stake typed earlier shouldn't hold back the solo picks' chips or the button's total.
function placeableParlayStake(picks: SlipPick[], parlayStake: string): number {
  return picks.filter((p) => p.parlay).length >= 2 ? (wholeDc(parlayStake) ?? 0) : 0
}

// What a stake can use: the balance, less every other stake the slip already holds. A solo pick's
// chips leave out its own stake, and the parlay's leave out the parlay's.
function availableFor(
  except: string | 'parlay',
  { balance, picks, stakes, parlayStake }: { balance: number; picks: SlipPick[]; stakes: Record<string, string>; parlayStake: string },
): number {
  const solos = picks
    .filter((p) => !p.parlay && p.outcomeId !== except)
    .reduce((sum, p) => sum + (wholeDc(stakes[p.outcomeId]) ?? 0), 0)
  const parlay = except !== 'parlay' ? placeableParlayStake(picks, parlayStake) : 0
  return Math.max(0, balance - solos - parlay)
}

function StakeChips({ label, available, onPick }: { label: string; available: number; onPick: (value: string) => void }) {
  const chipClass = cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'px-2 tabular-nums')
  return (
    <div role="group" aria-label={label} className="grid grid-cols-4 gap-2">
      {QUICK_STAKES.map((amount) => (
        <button key={amount} type="button" disabled={amount > available} className={chipClass} onClick={() => onPick(String(amount))}>
          {amount}
        </button>
      ))}
      <button
        type="button"
        disabled={available < 1}
        aria-label={`Max, ${available} DC`}
        className={chipClass}
        onClick={() => onPick(String(available))}
      >
        Max
      </button>
    </div>
  )
}

const segmentClass = (on: boolean) =>
  cn(
    'pressable min-h-11 cursor-pointer rounded-[10px] px-3 text-[15px] font-bold disabled:cursor-not-allowed disabled:opacity-50',
    on ? 'bg-surface text-ink shadow-tab' : 'text-ink2',
  )

const LEG_BLOCK_NOTE: Record<NonNullable<SlipPick['legBlock']>, string> = {
  own_market: 'You created this market, so it can’t be in a parlay. Switch it to Solo.',
  floor: `A parlay pick needs at least ${MIN_LEG_POOL} DC from ${MIN_LEG_BETTORS} other members on its market. Switch it to Solo, or add it once more members have bet.`,
}

// A Solo pick shows what each DC on it would pay from the real pool now; a Parlay pick shows what
// its leg would be priced at if the market closed now. Both are estimates until close.
function pickOdds(pick: SlipPick): string | null {
  if (pick.parlay) return `~${formatOdds(pick.oddsBp)}×`
  const bp = legOddsBp(pick.totalPool, pick.outcomePool)
  return bp === null ? null : `${formatOdds(bp)}×`
}

function PickRow({ pick, error }: { pick: SlipPick; error?: string }) {
  const slip = useSlip()
  const { remove, setMode, stakes, setStake } = slip
  const [removing, startRemove] = useTransition()
  const stakeId = `slip-stake-${pick.outcomeId}`
  const errorId = `slip-pick-error-${pick.outcomeId}`
  const stake = wholeDc(stakes[pick.outcomeId])
  const name = `${pick.outcomeLabel}, ${pick.marketTitle}`
  const odds = pickOdds(pick)
  const blockId = `slip-pick-block-${pick.outcomeId}`

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
          odds !== null && <span className="text-lg font-extrabold tabular-nums">{odds}</span>
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
              className={segmentClass(pick.parlay)}
              onClick={() => setMode(pick.outcomeId, true)}
            >
              Parlay
            </button>
          </div>
          {!pick.parlay && (
            <>
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
              <StakeChips
                label={`Quick stakes for ${name}`}
                available={availableFor(pick.outcomeId, slip)}
                onPick={(value) => setStake(pick.outcomeId, value)}
              />
            </>
          )}
          {pick.parlay && pick.legBlock && (
            <Message tone="gold" id={blockId}>
              {LEG_BLOCK_NOTE[pick.legBlock]}
            </Message>
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

const LOST_RESPONSE = 'We couldn’t confirm your bets. Check your connection and tap Place again. Nothing will be placed twice.'

export function SlipPanel() {
  const slip = useSlip()
  const { picks, parlayStake, setParlayStake, stakes, attemptKeyRef, lostResponse, setLostResponse, clearStakes, setOpen } = slip
  const [state, formAction] = useActionState<PlaceSlipState, FormData>(async (prev, formData) => {
    attemptKeyRef.current ??= crypto.randomUUID()
    formData.set('idempotency_key', attemptKeyRef.current)
    let next: PlaceSlipState
    try {
      next = await placeSlipAction(prev, formData)
    } catch {
      // The bets may have gone through with only the answer lost. Keeping the slip, and its key,
      // makes tapping Place again safe either way.
      setLostResponse(true)
      return undefined
    }
    setLostResponse(false)
    if (next?.placed) {
      toast.success(placedMessage(next.placed))
      haptics.success()
      clearStakes()
      setOpen(false)
    }
    return next
  }, undefined)
  const formError = lostResponse ? LOST_RESPONSE : state?.formError

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
  const legBps = legs.map((p) => p.oddsBp)
  const { multiplierBp, capped } = combineOdds(legBps)
  const parlayStakeDc = wholeDc(parlayStake)
  const legsBlocked = legs.some((p) => p.legBlock !== null)
  const parlayReady =
    legs.length === 0 ||
    (legs.length >= 2 && legs.length <= MAX_PICKS && !legsBlocked && parlayStakeDc !== null && parlayStakeDc <= MAX_PAYOUT)
  const parlayPays = parlayStakeDc !== null ? potentialPayout(parlayStakeDc, legBps) : null
  const solosReady = solos.every((p) => wholeDc(stakes[p.outcomeId]) !== null)
  const allOpen = picks.every((p) => p.open)
  const betCount = solos.length + (legs.length > 0 ? 1 : 0)
  const total = solos.reduce((sum, p) => sum + (wholeDc(stakes[p.outcomeId]) ?? 0), 0) + placeableParlayStake(picks, parlayStake)
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
        Each pick is a Solo bet with its own stake, or part of one Parlay that pays only if all its picks win.{' '}
        <Link href="/how-it-works#how-the-slip-solo-bets-and-parlays" transitionTypes={['nav-forward']}>
          How parlays pay
        </Link>
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
            {legs.length >= 2 && !legsBlocked && (
              <span className="font-extrabold tabular-nums">
                ~{formatOdds(multiplierBp)}×{capped && ` (capped at ${MAX_MULTIPLIER}×)`}
              </span>
            )}
          </div>
          <p className="text-sm text-ink2">
            Each pick’s odds are set when its market closes, from other members’ money on it (at most{' '}
            {MAX_LEG_ODDS}× a pick), so these are estimates until then.
          </p>
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
                max={MAX_PAYOUT}
                step="1"
                value={parlayStake}
                onChange={(e) => setParlayStake(e.target.value)}
                className="w-28 bg-surface"
                aria-invalid={Boolean(parlayError)}
                aria-describedby={parlayError ? 'slip-parlay-error' : undefined}
              />
              {parlayStakeDc !== null && parlayStakeDc > MAX_PAYOUT ? (
                <span className="text-sm text-ink2">A parlay pays at most {MAX_PAYOUT} DC, so stake at most {MAX_PAYOUT} DC.</span>
              ) : (
                parlayPays !== null &&
                !legsBlocked && (
                  <span className="text-sm text-ink2">
                    Pays ~{parlayPays} DC if every pick wins{parlayPays === MAX_PAYOUT && ', the most a parlay pays'}
                  </span>
                )
              )}
            </div>
          )}
          {!legNote && (
            <StakeChips
              label="Quick stakes for the parlay"
              available={Math.min(availableFor('parlay', slip), MAX_PAYOUT)}
              onPick={setParlayStake}
            />
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
      {formError && (
        <Message tone="error" id="slip-error">
          {formError}
        </Message>
      )}
      <FormSubmitButton
        block
        disabled={!allOpen || !solosReady || !parlayReady}
        aria-describedby={!allOpen ? 'slip-blocked' : formError ? 'slip-error' : undefined}
      >
        {`Place ${betCount} ${betCount === 1 ? 'bet' : 'bets'}${total > 0 ? ` · ${total} DC` : ''}`}
      </FormSubmitButton>
    </form>
  )
}
