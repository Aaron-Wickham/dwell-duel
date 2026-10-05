'use client'

import { useActionState, useEffect, useRef, useTransition, type MouseEvent } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { useSlip } from '@/components/slip/slip-provider'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { ListCard, listCardsClass } from '@/components/ui/list-card'
import { h2Class, labelClass, rowTitleClass, uiTextClass } from '@/components/ui/page'
import { SegmentedControl, segmentClass, segmentMarker } from '@/components/ui/segmented-control'
import { StatusChip } from '@/components/ui/status-chip'
import type { SlipPick } from '@/lib/parlays/get-slip'
import { lmsrPrices } from '@/lib/markets/lmsr'
import { formatOdds, lmsrParlayQuote, MAX_PICKS } from '@/lib/parlays/odds'
import { placeSlipAction, type PlaceSlipState } from '@/lib/parlays/place-slip'
import { soloPays } from '@/lib/parlays/solo-pays'
import { removeFromSlipAction } from '@/lib/parlays/slip-actions'
import { haptics } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import { formatDcAmount } from '@/lib/format/dc'

function wholeDc(value: string | undefined): number | null {
  const n = Number(value)
  return value && Number.isInteger(n) && n > 0 ? n : null
}

function placedMessage(placed: NonNullable<NonNullable<PlaceSlipState>['placed']>): string {
  const parts: string[] = []
  if (placed.solos > 0) parts.push(`${placed.solos} solo bet${placed.solos === 1 ? '' : 's'}`)
  if (placed.parlay) {
    parts.push(`a ${placed.parlay.legs}-pick parlay paying ${formatDcAmount(placed.parlay.potentialPayout)} (${formatOdds(placed.parlay.multiplierBp)}×)`)
  }
  if (placed.replayed) {
    return parts.length > 0
      ? `Your earlier attempt already went through: ${parts.join(' and ')}.`
      : 'Your earlier attempt already went through.'
  }
  return `Placed ${parts.join(' and ')}. Bets are final.`
}

const QUICK_STAKES = [5, 10, 25]

// "Place bet · 10 DC", "Place 3 bets · 30 DC", or "Place parlay · 10 DC" when the parlay is all
// the slip holds.
function placeLabel(solos: number, parlay: boolean, total: number): string {
  const bets = solos + (parlay ? 1 : 0)
  const what = solos === 0 && parlay ? 'parlay' : bets === 1 ? 'bet' : `${bets} bets`
  return `Place ${what}${total > 0 ? ` · ${formatDcAmount(total)}` : ''}`
}

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
  const chipClass = cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'px-2')
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
        aria-label={`Max, ${formatDcAmount(available)}`}
        className={chipClass}
        onClick={() => onPick(String(available))}
      >
        Max
      </button>
    </div>
  )
}

const modeClass = (on: boolean) => cn(segmentClass(on), uiTextClass, 'disabled:cursor-not-allowed disabled:opacity-50')

// The pick's chance now, as the market page shows it.
function pickChance(pick: SlipPick): string | null {
  if (!pick.lmsr) return null
  const price = lmsrPrices(pick.lmsr.q, pick.lmsr.liquidity)[pick.lmsr.index]
  return price === undefined ? null : `${Math.round(price * 100)}%`
}

// The drawer's Close button (slip-drawer.tsx), where focus goes when the last pick is removed.
export const SLIP_CLOSE_ID = 'slip-close'

const removeId = (outcomeId: string) => `slip-remove-${outcomeId}`

function PickRow({
  pick,
  error,
  showMode,
  onRemove,
}: {
  pick: SlipPick
  error?: string
  // A parlay needs two picks, so a lone pick has no Solo/Parlay switch, unless it's already a
  // Parlay pick and needs the switch to come back to Solo.
  showMode: boolean
  // Called as the pick is removed with whether its button had focus, so focus can move on.
  onRemove: (outcomeId: string, hadFocus: boolean) => void
}) {
  const slip = useSlip()
  const { remove, setMode, stakes, setStake } = slip
  const [removing, startRemove] = useTransition()
  const stakeId = `slip-stake-${pick.outcomeId}`
  const errorId = `slip-pick-error-${pick.outcomeId}`
  const stake = wholeDc(stakes[pick.outcomeId])
  const pays = stake !== null ? soloPays(pick.lmsr, stake) : null
  const name = `${pick.outcomeLabel}, ${pick.marketTitle}`
  const chance = pickChance(pick)
  // Every stake counts toward the shortfall, so each filled one is marked and points to the why.
  const overBudget = stake !== null && slipTotal(slip) > slip.balance

  function handleRemove(event: MouseEvent<HTMLButtonElement>) {
    if (removing) return
    const hadFocus = document.activeElement === event.currentTarget
    startRemove(async () => {
      haptics.tap()
      onRemove(pick.outcomeId, hadFocus)
      remove(pick.outcomeId)
      // The card leaving and the slip button's count say it's gone; no toast (#392).
      await removeFromSlipAction(pick.outcomeId)
    })
  }

  return (
    <ListCard tappable={false} className="flex flex-col gap-3 bg-surface">
      <input type="hidden" name="pick" value={`${pick.outcomeId}:${pick.parlay ? 'parlay' : 'solo'}`} />
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 grow flex-col gap-1">
          <Link href={`/markets/${pick.marketId}`} transitionTypes={['nav-forward']} className="hit-area text-sm break-words">
            {pick.marketTitle}
          </Link>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn(rowTitleClass, 'break-words')}>{pick.outcomeLabel}</span>
            {pick.open ? (
              chance !== null && <span className="text-ink2">· {chance}</span>
            ) : (
              <StatusChip tone="lost">No longer available</StatusChip>
            )}
          </p>
        </div>
        {/* A button, not a ToastActionForm: this row sits inside the slip's own form. */}
        <Button
          id={removeId(pick.outcomeId)}
          variant="quiet"
          size="sm"
          aria-label={`Remove ${name}`}
          aria-disabled={removing || undefined}
          className="-mt-1.5 -mr-1.5 px-2.5"
          onClick={handleRemove}
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </div>

      {pick.open && (
        <>
          {showMode && (
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
          )}
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
              </div>
              <StakeChips
                label={`Quick stakes for ${name}`}
                available={availableFor(pick.outcomeId, slip)}
                onPick={(value) => setStake(pick.outcomeId, value)}
              />
              {pays !== null && (
                <>
                  {/* The payout shown, so place_lmsr_bet can refuse one that has since moved by more than 2%. */}
                  <input type="hidden" name={`payout:${pick.outcomeId}`} value={pays} />
                  <p>
                    Wins <span className="font-extrabold text-win">{formatDcAmount(pays)}</span>
                  </p>
                </>
              )}
            </>
          )}
        </>
      )}
      {error && (
        <Message tone="error" id={errorId}>
          {error}
        </Message>
      )}
    </ListCard>
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

  // A removed pick takes its focused Remove button with it, which would drop focus out of the
  // sheet. Focus moves to the next pick's Remove (or the previous one's), or to Close once the
  // slip is empty.
  const focusAfterRemove = useRef<string | null>(null)
  function handleRemove(outcomeId: string, hadFocus: boolean) {
    if (!hadFocus) return
    const i = picks.findIndex((p) => p.outcomeId === outcomeId)
    const neighbour = picks[i + 1] ?? picks[i - 1]
    focusAfterRemove.current = neighbour ? removeId(neighbour.outcomeId) : SLIP_CLOSE_ID
  }
  useEffect(() => {
    const target = focusAfterRemove.current && document.getElementById(focusAfterRemove.current)
    if (!target) return
    focusAfterRemove.current = null
    target.focus()
  }, [picks])

  if (picks.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h2 id="slip-title" className={h2Class}>
          Your slip
        </h2>
        <EmptyState
          title="Your slip is empty."
          action={
            <Link href="/markets" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'no-underline')}>
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
              ? `This slip needs ${formatDcAmount(total)}; you have ${formatDcAmount(balance)}.`
              : null

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="slip-title" className={h2Class}>
          Your slip
        </h2>
        <p className="text-sm text-ink2">
          <span className="sr-only">Balance </span>
          <span className="whitespace-nowrap">{formatDcAmount(balance)}</span>
          {short && (
            <>
              {' · '}
              <span className="font-extrabold whitespace-nowrap text-loss">{formatDcAmount(total - balance)} short</span>
            </>
          )}
        </p>
      </div>
      <ul className={listCardsClass}>
        {picks.map((pick) => (
          <PickRow
            key={pick.outcomeId}
            pick={pick}
            showMode={picks.length >= 2 || pick.parlay}
            onRemove={handleRemove}
            error={stale(pick.outcomeId, stakes[pick.outcomeId] ?? '') ? undefined : state?.pickErrors?.[pick.outcomeId]}
          />
        ))}
      </ul>
      {(picks.length >= 2 || legs.length > 0) && (
        <p className="text-sm">
          <Link href="/how-it-works/rules#how-the-slip-solo-bets-and-parlays" transitionTypes={['nav-forward']} className="hit-area">
            How parlays pay
          </Link>
        </p>
      )}

      {legs.length > 0 && (
        <section aria-labelledby="slip-parlay-title" className="flex flex-col gap-3 rounded-tile bg-sunk p-3.5 md:p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="slip-parlay-title" className="font-extrabold">
              Parlay · {legs.length} {legs.length === 1 ? 'pick' : 'picks'}
            </h3>
            {fixedQuote && <span className="font-extrabold">{formatOdds(fixedQuote.multiplierBp)}×</span>}
          </div>
          {legNote ? (
            <p className="text-sm text-ink2">{legNote}</p>
          ) : (
            <>
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
              </div>
              <StakeChips label="Quick stakes for the parlay" available={availableFor('parlay', slip)} onPick={setParlayStake} />
              {fixedQuote && (
                <>
                  {/* The payout shown, so place_lmsr_parlay can refuse one that has since moved by more than 2%. */}
                  <input type="hidden" name="parlay_payout" value={fixedQuote.payout} />
                  <p>
                    Wins <span className="font-extrabold text-win">{formatDcAmount(fixedQuote.payout)}</span> if every pick wins
                  </p>
                </>
              )}
            </>
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
      <div className="flex flex-col gap-2">
        <FormSubmitButton
          block
          disabled={!allOpen || !solosReady || !parlayReady || short}
          aria-describedby={!allOpen ? 'slip-blocked' : formError ? 'slip-error' : broke || why ? WHY_ID : undefined}
        >
          {placeLabel(solos.length, legs.length > 0, total)}
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
        <p className="text-center text-sm text-ink2">Bets are final once placed.</p>
      </div>
    </form>
  )
}
