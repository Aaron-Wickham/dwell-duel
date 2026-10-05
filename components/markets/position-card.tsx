import type { ReactNode } from 'react'
import Link from 'next/link'
import { ResultChip } from '@/components/bets/result-chip'
import { LegPill } from '@/components/parlays/parlay-parts'
import { LocalTime } from '@/components/ui/local-time'
import { rowTitleClass } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { legSummary, positionSummary, type MarketPosition } from '@/lib/markets/position'
import { cn } from '@/lib/utils'
import { formatDcAmount } from '@/lib/format/dc'

const SUMMARY_TONE = { plain: '', win: 'font-bold text-win', loss: 'font-bold text-ink' } as const

function Row({ title, detail, aside }: { title: ReactNode; detail?: ReactNode; aside: ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className={cn(rowTitleClass, 'break-words')}>{title}</p>
        {detail && <p className="text-sm text-ink2">{detail}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">{aside}</div>
    </li>
  )
}

// #262: the viewer's own stake on this market, so it never hides past the Bets card's "Show more".
// Each solo bet is its own row with its own Cancel; each parlay with a leg here links to the parlay.
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
    <SectionCard
      title="Your position"
      titleId="position-title"
      description={summary && <span className={SUMMARY_TONE[summary.tone]}>{summary.text}</span>}
      className={cn('gap-1 border-2 border-ink', className)}
    >
      <ul className="flex flex-col divide-y divide-line">
        {position.bets.map((b) => {
          const live = b.result.kind === 'open' || b.result.kind === 'awaiting'
          return (
            <Row
              key={`bet-${b.id}`}
              title={`${formatDcAmount(b.amount)} on ${b.outcomeLabel}`}
              detail={
                live ? (
                  <>
                    Placed <LocalTime iso={b.placedAt} format="dateTime" />
                  </>
                ) : b.result.kind === 'won' && resolvedAt ? (
                  <>
                    Paid <LocalTime iso={resolvedAt} format="day" />
                  </>
                ) : null
              }
              aside={
                <>
                  {b.paysIfWins !== null && (
                    <span className="font-extrabold">{`Pays ${formatDcAmount(b.paysIfWins)}`}</span>
                  )}
                  <ResultChip result={b.result} />
                </>
              }
            />
          )
        })}
        {position.legs.map(({ parlay, leg }) => (
          <Row
            key={`parlay-${parlay.id}`}
            title={`Parlay pick: ${leg.outcomeLabel}`}
            detail={legSummary({ parlay, leg })}
            aside={
              <>
                <LegPill status={leg.status} />
                <Link
                  href={`/parlays/${parlay.id}`}
                  transitionTypes={['nav-forward']}
                  aria-label={`View parlay: ${parlay.legs.length} picks, ${formatDcAmount(parlay.stake)}`}
                  className="pressable hit-area text-sm font-bold"
                >
                  View parlay
                </Link>
              </>
            }
          />
        ))}
      </ul>
    </SectionCard>
  )
}
