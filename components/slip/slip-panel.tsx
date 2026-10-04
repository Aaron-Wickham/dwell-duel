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
import { h2Class, labelClass, rowTitleClass, uiTextClass } from '@/components/ui/page'
import { SegmentedControl, segmentClass, segmentMarker } from '@/components/ui/segmented-control'
import { StatusChip } from '@/components/ui/status-chip'
import type { SlipPick } from '@/lib/parlays/get-slip'
import { lmsrPrices } from '@/lib/markets/lmsr'
import { lmsrOddsBp, lmsrQuote } from '@/lib/markets/pricing'
import { formatOdds, lmsrParlayQuote, MAX_PICKS } from '@/lib/parlays/odds'
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
  if (placed.parlay) {
    parts.push(`a ${placed.parlay.legs}-leg parlay paying ${placed.parlay.potentialPayout} DC (${formatOdds(placed.parlay.multiplierBp)}×)`)
  }
  if (placed.replayed) {
    return parts.length > 0
      ? `Your earlier attempt already went through: ${parts.join(' and ')}.`
      : 'Your earlier attempt already went through.'
  }
  return `Placed ${parts.join(' and ')}. Bets are final.`
}

const QUICK_STAKES = [5, 10, 25]

// A parlay stake only counts once there's a parlay to place: a lone Parlay pick has no stake field,
// so a stake typed earlier shouldn't hold back the solo picks' chips or the button's total.
function placeableParlayStake(picks: SlipPick[], parlayStake: string): number {
  return picks.filter((p) => p.parlay).length >= 2 ? (wholeDc(parlayStake) ?? 0) : 0
}

type SlipStakes = { picks: SlipPick[]; stakes: Record<string, string>; parlayStake: string }

function slipTotal({ picks, stakes, parlayStake }: SlipStakes): number {
  return picks.filter((p) => !p.parlay).reduce((sum, p) => sum + (wholeDc(stakes[p.outcomeId]) ?? 0), 0) + placeableParlayStake(picks, parlayStake)
}

// Where the Place button points when it can't be pressed, or when the stakes are more than the
// balance; slip-panel.tsx renders this id once, under the button.
const WHY_ID = 'slip-why'

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

const modeClass = (on: boolean) => cn(segmentClass(on), uiTextClass, 'disabled:cursor-not-allowed disabled:opacity-50')

// What a Solo stake pays if it wins, exactly as place_lmsr_bet will (0102).
function lmsrPays(pick: SlipPick, stake: number): number | null {
  return pick.lmsr ? lmsrQuote(pick.lmsr.q, pick.lmsr.liquidity, pick.lmsr.index, stake).payout : null
}

// What each DC on the pick would pay now, at its price.
function pickOdds(pick: SlipPick): string | null {
  if (!pick.lmsr) return null
  const bp = lmsrOddsBp(lmsrPrices(pick.lmsr.q, pick.lmsr.liquidity)[pick.lmsr.index] ?? null)
  return bp === null ? null : `${formatOdds(bp)}×`
}

function PickRow({ pick, error }: { pick: SlipPick; error?: string }) {
  const slip = useSlip()
  const { remove, setMode, stakes, setStake } = slip
  const [removing, startRemove] = useTransition()
  const stakeId = `slip-stake-${pick.outcomeId}`
  const errorId = `slip-pick-error-${pick.outcomeId}`
  const stake = wholeDc(stakes[pick.outcomeId])
  const pays = stake !== null ? lmsrPays(pick, stake) : null
  const name = `${pick.outcomeLabel}, ${pick.marketTitle}`
  const odds = pickOdds(pick)
  // Every stake counts toward the shortfall, so each filled one is marked and points to the why.
  const overBudget = stake !== null && slipTotal(slip) > slip.balance

  return (
    <li className="flex flex-col gap-3 py-4">
      <input type="hidden" name="pick" value={`${pick.outcomeId}:${pick.parlay ? 'parlay' : 'solo'}`} />
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 grow flex-col gap-1">
          <Link href={`/markets/${pick.marketId}`} transitionTypes={['nav-forward']} className="hit-area text-sm">
            {pick.marketTitle}
          </Link>
          <span className={rowTitleClass}>{pick.outcomeLabel}</span>
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
          <SegmentedControl role="group" aria-label={`Bet type for ${name}`} activeKey={pick.parlay ? 'parlay' : 'solo'} className="grid grid-cols-2">
            <button
              type="button"
              aria-pressed={!pick.parlay}
              {...segmentMarker(!pick.parlay)}
              className={modeClass(!pick.parlay)}
              onClick={() => setMode(pick.outcomeId, false)}
            >
              Solo
            </button>
            <button
              type="button"
              aria-pressed={pick.parlay}
              {...segmentMarker(pick.parlay)}
              className={modeClass(pick.parlay)}
              onClick={() => setMode(pick.outcomeId, true)}
            >
              Parlay
            </button>
          </SegmentedControl>
          {!pick.parlay && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor={stakeId} className={labelClass}>
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
                  aria-invalid={Boolean(error) || overBudget}
                  aria-describedby={error ? errorId : overBudget ? WHY_ID : undefined}
                />
                {pays !== null && (
                  <>
                    {/* The payout shown, so place_lmsr_bet can refuse one that has since moved by more than 2%. */}
                    <input type="hidden" name={`payout:${pick.outcomeId}`} value={pays} />
                    <span className="text-sm text-ink2">Pays {pays} DC if it wins</span>
                  </>
                )}
              </div>
              <StakeChips
                label={`Quick stakes for ${name}`}
                available={availableFor(pick.outcomeId, slip)}
                onPick={(value) => setStake(pick.outcomeId, value)}
              />
            </>
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
  const { picks, parlayStake, setParlayStake, stakes, balance, attemptKeyRef, lostResponse, setLostResponse, clearStakes, setOpen } = slip
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
  // A price-moved message names what the stake it was refused at pays now; once that stake
  // changes, the figure is stale and the slip's own quote takes over.
  const stale = (key: string, current: string) => state?.movedStakes?.[key] !== undefined && state.movedStakes[key] !== current

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
  const parlayStakeDc = wholeDc(parlayStake)
  // The stake is split across the legs and the payout fixed when placed (0104). A leg on a pool
  // market is no longer available, which holds the whole slip back on its own.
  const lmsrLegs = legs.flatMap((p) => (p.lmsr ? [p.lmsr] : []))
  const parlayReady = legs.length === 0 || (legs.length >= 2 && legs.length <= MAX_PICKS && parlayStakeDc !== null)
  // Exactly what place_lmsr_parlay will store, which the form sends back so a moved price is caught.
  const fixedQuote =
    lmsrLegs.length === legs.length && legs.length >= 2 && legs.length <= MAX_PICKS && parlayStakeDc !== null
      ? lmsrParlayQuote(lmsrLegs, parlayStakeDc)
      : null
  const solosReady = solos.every((p) => wholeDc(stakes[p.outcomeId]) !== null)
  const allOpen = picks.every((p) => p.open)
  const betCount = solos.length + (legs.length > 0 ? 1 : 0)
  const total = slipTotal(slip)
  const short = total > balance
  const parlayOverBudget = short && placeableParlayStake(picks, parlayStake) > 0
  const parlayError = state?.parlayError && !stale('parlay', parlayStake) ? state.parlayError : undefined
  const legNote =
    legs.length === 1
      ? 'A parlay needs at least 2 picks. Switch another pick to Parlay, or this one back to Solo.'
      : legs.length > MAX_PICKS
        ? `A parlay can have at most ${MAX_PICKS} picks.`
        : null
  // The first thing holding Place back, said under it (#260). A pick that's no longer available
  // has its own note above the button. At 0 DC nothing can be placed, so that says where to earn.
  const broke = balance === 0
  const why = broke
    ? null
    : !solosReady
        ? 'Enter a stake for each Solo pick.'
        : legNote
          ? legNote
          : legs.length > 0 && parlayStakeDc === null
            ? 'Enter a stake for the parlay.'
            : short
              ? `This slip needs ${total} DC; you have ${balance} DC.`
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
      <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-control bg-sunk px-3 py-2.5 text-sm">
        <span>
          Balance <strong className="tabular-nums">{balance} DC</strong>
        </span>
        <span className={cn('tabular-nums', short ? 'font-extrabold text-loss' : 'text-ink2')}>
          {short ? `${total - balance} DC short` : `${balance - total} DC left after this slip`}
        </span>
      </p>
      <p className="text-sm text-ink2">
        Each pick is a Solo bet with its own stake, or part of one Parlay that pays only if all its picks win.{' '}
        <Link href="/how-it-works#how-the-slip-solo-bets-and-parlays" transitionTypes={['nav-forward']}>
          How parlays pay
        </Link>
      </p>
      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {picks.map((pick) => (
          <PickRow
            key={pick.outcomeId}
            pick={pick}
            error={stale(pick.outcomeId, stakes[pick.outcomeId] ?? '') ? undefined : state?.pickErrors?.[pick.outcomeId]}
          />
        ))}
      </ul>

      {legs.length > 0 && (
        <section aria-labelledby="slip-parlay-title" className="flex flex-col gap-3 rounded-card bg-sunk p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="slip-parlay-title" className="font-extrabold">
              Parlay · {legs.length} {legs.length === 1 ? 'pick' : 'picks'}
            </h3>
            {fixedQuote && <span className="font-extrabold tabular-nums">{formatOdds(fixedQuote.multiplierBp)}×</span>}
          </div>
          <p className="text-sm text-ink2">
            Your stake is split evenly across these picks, and each part buys at its market’s price now, so what the parlay
            pays is fixed when you place it.
          </p>
          {legNote ? (
            <p className="text-sm text-ink2">{legNote}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="slip-parlay-stake" className={labelClass}>
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
                aria-invalid={Boolean(parlayError) || parlayOverBudget}
                aria-describedby={parlayError ? 'slip-parlay-error' : parlayOverBudget ? WHY_ID : undefined}
              />
              {fixedQuote && (
                <>
                  {/* The payout shown, so place_lmsr_parlay can refuse one that has since moved by more than 2%. */}
                  <input type="hidden" name="parlay_payout" value={fixedQuote.payout} />
                  <span className="text-sm text-ink2">
                    Pays {fixedQuote.payout} DC ({formatOdds(fixedQuote.multiplierBp)}×) if every pick wins
                  </span>
                </>
              )}
            </div>
          )}
          {!legNote && (
            <StakeChips
              label="Quick stakes for the parlay"
              available={availableFor('parlay', slip)}
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
      <p className="text-sm text-ink2">Bets are final: once placed, they can’t be cancelled.</p>
      <FormSubmitButton
        block
        disabled={!allOpen || !solosReady || !parlayReady || short}
        aria-describedby={!allOpen ? 'slip-blocked' : formError ? 'slip-error' : broke || why ? WHY_ID : undefined}
      >
        {`Place ${betCount} ${betCount === 1 ? 'bet' : 'bets'}${total > 0 ? ` · ${total} DC` : ''}`}
      </FormSubmitButton>
      {broke ? (
        <Message tone="gold" id={WHY_ID}>
          You have 0 DC. Earn more with{' '}
          <Link href="/tasks" className="text-inherit">
            Tasks
          </Link>
          , then come back to this slip.
        </Message>
      ) : (
        why && (
          <p id={WHY_ID} className="text-sm text-ink2">
            {why}
          </p>
        )
      )}
    </form>
  )
}
