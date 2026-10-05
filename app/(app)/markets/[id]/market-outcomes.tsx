import Link from 'next/link'
import { Ticket } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import type { MarketDetail } from '@/lib/markets/get-market'
import type { OutcomeOdds } from '@/lib/markets/odds'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { getParlayRiding } from '@/lib/markets/parlay-riding'
import { lmsrState } from '@/lib/markets/pricing'
import type { ResolutionProof } from '@/lib/markets/resolution-proof'
import { rowState } from '@/lib/markets/row-state'
import { MAX_SLIP_PICKS, SLIP_FULL_MESSAGE } from '@/lib/parlays/parse-slip'
import { addToSlipAction, removeFromSlipAction } from '@/lib/parlays/slip-actions'
import { EXAMPLE_STAKE, soloPays } from '@/lib/parlays/solo-pays'
import { ContentReveal } from '@/components/nav/page-transition'
import { OutcomeRow } from '@/components/markets/outcome-row'
import { ProofList } from '@/components/proof/proof-list'
import { Message } from '@/components/ui/message'
import { rowTitleClass } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { formatDcAmount } from '@/lib/format/dc'
import { cn } from '@/lib/utils'

// The outcomes stream on their own, since only they wait on the parlay figure. A settled market
// states its result here, once, above its rows (#390). Exported for the component tests, which
// render this async section directly.
export async function MarketOutcomes({
  market,
  odds,
  slip,
  canBet,
  resolution,
}: {
  market: MarketDetail
  odds: OutcomeOdds[]
  slip: string[]
  canBet: boolean
  resolution: ResolutionProof | null
}) {
  const { supabase } = await requireUser()
  // A voided market's legs dropped out of their parlays, but parlay_legs has no status of its own,
  // so the read would still count them.
  const riding = market.status === 'voided' ? new Map<string, number>() : await getParlayRiding(supabase, market.id)
  const ridingTotal = [...riding.values()].reduce((sum, n) => sum + n, 0)

  const lmsr = market.pricing === 'lmsr'
  const q = lmsrState(market.outcomes)
  const marketInSlip = market.outcomes.some((o) => slip.includes(o.id))
  const slipFull = slip.length >= MAX_SLIP_PICKS && !marketInSlip
  const resolved = market.status === 'resolved' && market.resolvedOutcomeLabel !== null

  return (
    <ContentReveal>
      <SectionCard title="Outcomes" titleId="outcomes-title" className="gap-1">
        <OutcomesStatus market={market} canBet={canBet} resolution={resolution} />
        {canBet && slipFull && (
          <Message tone="gold" icon={Ticket} id="slip-full-note" className="mt-2">
            {SLIP_FULL_MESSAGE}
          </Message>
        )}
        <ul className="flex flex-col divide-y divide-line">
          {odds.map((o, index) => {
            const lmsrPick = lmsr ? { q, index, liquidity: market.liquidity } : undefined
            return (
              <li key={o.outcomeId}>
                <OutcomeRow
                  label={o.label}
                  probability={o.impliedProbability}
                  series={market.kind === 'multiple_choice' ? outcomeSeries(market.kind, o.label, index) : null}
                  state={rowState(o.outcomeId, { slip, canBet, slipFull })}
                  result={resolved ? (o.label === market.resolvedOutcomeLabel ? 'won' : 'lost') : null}
                  pays={canBet ? soloPays(lmsrPick, EXAMPLE_STAKE) : null}
                  slipPick={{
                    outcomeId: o.outcomeId,
                    outcomeLabel: o.label,
                    marketId: market.id,
                    marketTitle: market.title,
                    parlay: false,
                    open: canBet && lmsr,
                    ...(lmsrPick ? { lmsr: lmsrPick } : {}),
                  }}
                  addAction={addToSlipAction.bind(null, o.outcomeId)}
                  removeAction={removeFromSlipAction.bind(null, o.outcomeId)}
                  disabledReasonId={slipFull ? 'slip-full-note' : undefined}
                />
              </li>
            )
          })}
        </ul>
        {/* #279: parlay money is shown beside the chances, never in them. */}
        {ridingTotal > 0 && (
          <p className="border-t border-line pt-3 text-sm text-ink2">
            Includes {formatDcAmount(ridingTotal)} riding in parlays.{' '}
            <Link href="/how-it-works/rules#how-the-slip-solo-bets-and-parlays" transitionTypes={['nav-forward']}>
              How parlays pay
            </Link>
          </p>
        )}
      </SectionCard>
    </ContentReveal>
  )
}

const bannerClass = 'mb-2 flex flex-col gap-2 rounded-tile p-3.5 md:p-4'

// Where the market stands when it no longer takes bets: the result, the void, or the wait for one.
// The page's meta line already dates it, so none of these repeats the date.
function OutcomesStatus({ market, canBet, resolution }: { market: MarketDetail; canBet: boolean; resolution: ResolutionProof | null }) {
  if (market.status === 'resolved' && market.resolvedOutcomeLabel) {
    return (
      <div className={cn(bannerClass, 'bg-win-soft')}>
        <p className={cn(rowTitleClass, 'text-win')}>{market.resolvedOutcomeLabel} won</p>
        {market.actualValue !== null && <p className="font-bold">Actual: {market.actualValue}</p>}
        <p className="text-sm text-ink2">Solo bets have been paid; parlays pay once every pick has settled.</p>
        {resolution && (resolution.note || resolution.proof.length > 0 || resolution.previous) && (
          <section aria-label="Why it resolved this way" className="flex flex-col gap-3">
            {resolution.note && <p className="whitespace-pre-line break-words">{resolution.note}</p>}
            <ProofList proof={resolution.proof} label="Resolution proof" />
            {resolution.previous && (
              <div className="flex flex-col gap-2 text-sm text-ink2">
                <p>
                  Changed from <strong className="text-ink">{resolution.previous.outcomeLabel}</strong>
                  {resolution.previous.note ? <>. Earlier reason: “{resolution.previous.note}”</> : '.'}
                </p>
                <ProofList proof={resolution.previous.proof} label="Earlier resolution proof" />
              </div>
            )}
          </section>
        )}
      </div>
    )
  }
  if (market.status === 'voided') {
    return (
      <div className={cn(bannerClass, 'bg-sunk')}>
        <p className="font-bold">This market was called off. Every bet was refunded, and parlays dropped this pick.</p>
        {market.voidReason && (
          <section aria-label="Why it was called off">
            <p className="whitespace-pre-line break-words">{market.voidReason}</p>
          </section>
        )}
      </div>
    )
  }
  if (!canBet) {
    return (
      <p className="pb-2 text-ink2">Betting has closed. Waiting for a result.</p>
    )
  }
  return null
}
