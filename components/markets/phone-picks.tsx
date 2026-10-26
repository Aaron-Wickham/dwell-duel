import { Ticket } from 'lucide-react'
import { QuickPicks, type QuickPick } from '@/components/markets/quick-picks'
import { Message } from '@/components/ui/message'
import { uiTextClass } from '@/components/ui/page'
import type { MarketDetail } from '@/lib/markets/get-market'
import type { OutcomeOdds } from '@/lib/markets/odds'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { lmsrState } from '@/lib/markets/pricing'
import { MAX_SLIP_PICKS, SLIP_FULL_MESSAGE } from '@/lib/parlays/parse-slip'
import { addToSlipAction, removeFromSlipAction } from '@/lib/parlays/slip-actions'

// A multiple-choice market's likeliest outcomes, as many as fit above the chart on a phone.
export const PHONE_PICKS = 3
const SLIP_FULL_ID = 'quick-picks-slip-full'

// A two-outcome market's two sides in their own order, or a multiple-choice market's likeliest.
export function leadingPicks(market: MarketDetail, odds: OutcomeOdds[]): QuickPick[] {
  const q = lmsrState(market.outcomes)
  const multiple = market.kind === 'multiple_choice'
  const all = odds.map((o, index) => ({ o, index, pct: o.impliedProbability === null ? 0 : Math.round(o.impliedProbability * 100) }))
  const shown = multiple ? [...all].sort((a, b) => b.pct - a.pct).slice(0, PHONE_PICKS) : all
  return shown.map(({ o, index, pct }) => ({
    pick: {
      outcomeId: o.outcomeId,
      outcomeLabel: o.label,
      marketId: market.id,
      marketTitle: market.title,
      parlay: false,
      open: true,
      lmsr: { q, index, liquidity: market.liquidity },
    },
    pct,
    series: multiple ? outcomeSeries(market.kind, o.label, index) : null,
    addAction: addToSlipAction.bind(null, o.outcomeId),
    removeAction: removeFromSlipAction.bind(null, o.outcomeId),
  }))
}

// The market page's pick block on a phone (D-4): the outcomes sit below the chart there, so the
// leading ones come first, under the title, with their Add buttons in view. From lg the rail's
// outcomes are already beside the chart. Rendered only while the market takes lmsr bets.
export function PhonePicks({ market, odds, slip }: { market: MarketDetail; odds: OutcomeOdds[]; slip: string[] }) {
  const picks = leadingPicks(market, odds)
  if (picks.length === 0) return null
  // As the outcomes' Add: a full slip takes no pick from a market not already in it.
  const slipFull = slip.length >= MAX_SLIP_PICKS && !market.outcomes.some((o) => slip.includes(o.id))
  return (
    <section aria-labelledby="quick-picks-title" className="flex flex-col gap-2 lg:hidden">
      <h2 id="quick-picks-title" className="sr-only">
        Add a pick
      </h2>
      {slipFull && (
        <Message tone="gold" icon={Ticket} id={SLIP_FULL_ID}>
          {SLIP_FULL_MESSAGE}
        </Message>
      )}
      <QuickPicks picks={picks} disabledReasonId={slipFull ? SLIP_FULL_ID : undefined} />
      {picks.length < odds.length && (
        <a href="#outcomes-title" className={`pressable hit-area self-start font-bold ${uiTextClass}`}>
          See all {odds.length} outcomes
        </a>
      )}
    </section>
  )
}
