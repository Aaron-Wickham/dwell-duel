import Link from 'next/link'
import { Ticket } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import type { MarketDetail } from '@/lib/markets/get-market'
import type { OutcomeOdds } from '@/lib/markets/odds'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { getParlayRiding } from '@/lib/markets/parlay-riding'
import { lmsrOddsBp, lmsrState } from '@/lib/markets/pricing'
import { rowState } from '@/lib/markets/row-state'
import { legOddsBp } from '@/lib/parlays/odds'
import { MAX_SLIP_PICKS, SLIP_FULL_MESSAGE } from '@/lib/parlays/parse-slip'
import { addToSlipAction, removeFromSlipAction } from '@/lib/parlays/slip-actions'
import { ContentReveal } from '@/components/nav/page-transition'
import { OutcomeRow } from '@/components/markets/outcome-row'
import { Message } from '@/components/ui/message'
import { SectionCard } from '@/components/ui/section-card'

// The outcomes stream on their own, since only they wait on the parlay figure. Exported for the
// component tests, which render this async section directly.
export async function MarketOutcomes({
  market,
  odds,
  slip,
  canBet,
}: {
  market: MarketDetail
  odds: OutcomeOdds[]
  slip: string[]
  canBet: boolean
}) {
  const { supabase } = await requireUser()
  // A voided market's legs dropped out of their parlays, but parlay_legs has no status of its own,
  // so the read would still count them.
  const riding = market.status === 'voided' ? new Map<string, number>() : await getParlayRiding(supabase, market.id)

  const totalPool = odds.reduce((sum, o) => sum + o.poolTotal, 0)
  const lmsr = market.pricing === 'lmsr'
  const q = lmsrState(market.outcomes)
  const marketInSlip = market.outcomes.some((o) => slip.includes(o.id))
  const slipFull = slip.length >= MAX_SLIP_PICKS && !marketInSlip

  return (
    <ContentReveal>
      <SectionCard
        title="Outcomes"
        titleId="outcomes-title"
        action={<span className="text-sm text-ink2 tabular-nums">{totalPool} DC {lmsr ? 'bet' : 'in the pool'}</span>}
        className="gap-1"
      >
        {canBet && slipFull && (
          <Message tone="gold" icon={Ticket} id="slip-full-note" className="mt-2">
            {SLIP_FULL_MESSAGE}
          </Message>
        )}
        <ul className="flex flex-col divide-y divide-line">
          {odds.map((o, index) => {
            // What a DC on this outcome pays now: at its price on an lmsr market, or from the real pool
            // (0074: the seed is never paid), where an outcome nobody has backed shows no payout yet.
            const oddsBp = lmsr ? lmsrOddsBp(o.impliedProbability) : legOddsBp(totalPool, o.poolTotal)
            return (
            <li key={o.outcomeId}>
              <OutcomeRow
                label={o.label}
                poolTotal={o.poolTotal}
                probability={o.impliedProbability}
                oddsBp={oddsBp}
                series={outcomeSeries(market.kind, o.label, index)}
                state={rowState(o.outcomeId, { slip, canBet, slipFull })}
                winner={market.status === 'resolved' && o.label === market.resolvedOutcomeLabel}
                riding={riding.get(o.outcomeId) ?? 0}
                slipPick={{
                  outcomeId: o.outcomeId,
                  outcomeLabel: o.label,
                  marketId: market.id,
                  marketTitle: market.title,
                  parlay: false,
                  open: canBet,
                  // A new pick starts Solo and shows only until the slip's own read (getSlipView)
                  // replaces it, so its parlay figures are the plain pool's, not a quote.
                  oddsBp: oddsBp ?? 10_000,
                  legBlock: null,
                  outcomePool: o.poolTotal,
                  totalPool,
                  ...(lmsr ? { lmsr: { q, index, liquidity: market.liquidity } } : {}),
                }}
                addAction={addToSlipAction.bind(null, o.outcomeId)}
                removeAction={removeFromSlipAction.bind(null, o.outcomeId)}
                disabledReasonId={slipFull ? 'slip-full-note' : undefined}
              />
            </li>
            )
          })}
        </ul>
        {riding.size > 0 && (
          <p className="border-t border-line pt-3 text-sm text-ink2">
            {lmsr
              ? 'Each parlay’s share of its stake bought shares here, so it moved these odds like a bet; DwellDuel pays the parlay.'
              : 'Parlays are paid by DwellDuel, not from this pool, so parlay money never moves these odds.'}{' '}
            <Link href="/how-it-works#how-the-slip-solo-bets-and-parlays" transitionTypes={['nav-forward']}>
              How parlays pay
            </Link>
          </p>
        )}
      </SectionCard>
    </ContentReveal>
  )
}
