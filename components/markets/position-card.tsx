import Link from 'next/link'
import { ResultChip } from '@/components/bets/result-chip'
import { LegPill } from '@/components/parlays/parlay-parts'
import { LocalTime } from '@/components/ui/local-time'
import { PickChip } from '@/components/markets/pick-chip'
import { legSummary, positionSummary, type MarketPosition } from '@/lib/markets/position'
import { cn } from '@/lib/utils'
import { formatDcAmount } from '@/lib/format/dc'

const SUMMARY_TONE = { plain: '', win: 'font-bold text-win', loss: 'font-bold text-ink' } as const

// #262, #440: the viewer's own stake on this market, so it never hides past the Bets card's "Show
// more". A small blue strip on top of the outcomes rather than a card of its own: a line per bet
// (stake, pick, what it pays or how it ended) and per parlay with a pick here (linking to it).
export function PositionCard({
  position,
  resolvedAt,
  className,
}: {
  position: MarketPosition
  resolvedAt: string | null
  className?: string
}) {
  const summary = positionSummary(position.bets)
  return (
    <section aria-labelledby="position-title" className={cn('flex flex-col gap-1.5 rounded-tile bg-info-soft p-3.5 md:p-4', className)}>
      <h2 id="position-title" className="text-sm font-extrabold text-info">
        Your position
      </h2>
      {summary && <p className={cn('text-sm text-ink2', SUMMARY_TONE[summary.tone])}>{summary.text}</p>}
      <ul className="flex flex-col gap-1">
        {position.bets.map((b) => (
          <li key={`bet-${b.id}`} className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              <b className="whitespace-nowrap">{formatDcAmount(b.amount)}</b> on <PickChip label={b.outcomeLabel} />
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {b.paysIfWins !== null && <b className="whitespace-nowrap">{`Pays ${formatDcAmount(b.paysIfWins)}`}</b>}
              {/* Every bet in an open market is open, so only a result earns a chip (#387). */}
              {b.result.kind !== 'open' && <ResultChip result={b.result} />}
              {b.result.kind === 'won' && resolvedAt && (
                <span className="text-ink2">
                  Paid <LocalTime iso={resolvedAt} format="day" />
                </span>
              )}
            </span>
          </li>
        ))}
        {position.legs.map(({ parlay, leg }) => (
          <li key={`parlay-${parlay.id}`} className="flex flex-col gap-0.5 text-sm">
            <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="flex min-w-0 items-center gap-1.5">
                Parlay pick: <PickChip label={leg.outcomeLabel} />
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <LegPill status={leg.status} />
                <Link
                  href={`/parlays/${parlay.id}`}
                  transitionTypes={['nav-forward']}
                  aria-label={`View parlay: ${parlay.legs.length} picks, ${formatDcAmount(parlay.stake)}`}
                  className="pressable hit-area font-bold"
                >
                  View parlay
                </Link>
              </span>
            </span>
            <span className="text-ink2">{legSummary({ parlay, leg })}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
