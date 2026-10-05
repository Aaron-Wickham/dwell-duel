import type { ChartOutcome } from '@/components/markets/probability-chart'
import { SERIES_BG, SERIES_STROKE } from '@/components/markets/series-classes'
import { describeMovement } from '@/lib/markets/chart-summary'
import { chartWindow, initialRange, xPercent } from '@/lib/markets/chart-window'
import type { MarketKind } from '@/lib/markets/kind'
import { plottedOutcomes } from '@/lib/markets/outcome-series'
import { availableRanges, type SeriesPoint } from '@/lib/markets/probability-series'
import { sparklinePath } from '@/lib/markets/sparkline'
import { cn } from '@/lib/utils'

const EMPTY_TEXT = 'No bets were placed on this market.'
// market_sparks sends at most 24 points a card; thinned by time, a burst of bets is one step.
export const SPARKLINE_POINTS = 24

// A market card's chart: the full ProbabilityChart's window and colours, drawn as plain SVG so
// the markets list server-renders it and ships no charting library. The card says the chance and
// the result in words, so the chart carries no labels of its own.
export function MarketSparkline({
  kind,
  outcomes,
  points,
  now,
  closedAt,
  resolvedLabel = null,
}: {
  kind: MarketKind
  outcomes: ChartOutcome[]
  points: SeriesPoint[]
  now: number
  closedAt: string
  resolvedLabel?: string | null
}) {
  const closedMs = Date.parse(closedAt)
  const closed = closedMs <= now
  const range = initialRange(availableRanges(points, now), closed)
  const plot = chartWindow(points, range, now, closedMs, SPARKLINE_POINTS)
  const last = points.at(-1)
  const drawn = plottedOutcomes(kind, outcomes)
  // One line is the market's own, so it keeps its colour whoever won; of several, the losers grey.
  const muted = (outcome: ChartOutcome) => resolvedLabel !== null && drawn.length > 1 && outcome.label !== resolvedLabel

  const gridLine = <div aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-line" />

  if (!plot || !last) {
    return (
      <div className="relative h-16">
        {gridLine}
        <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs font-bold text-ink2">{EMPTY_TEXT}</p>
      </div>
    )
  }

  const closedLeft = `${xPercent(plot, closedMs)}%`
  const ended = plot.visible.at(-1) ?? last

  return (
    <div role="img" aria-label={describeMovement(drawn, plot, range)} className="relative h-16">
      {gridLine}
      {closed && (
        <>
          <div aria-hidden="true" data-slot="closed-zone" className="absolute inset-y-0 right-0 bg-sunk" style={{ left: closedLeft }} />
          <svg aria-hidden="true" className="absolute inset-y-0 h-full w-0.5 -translate-x-1/2 overflow-visible" style={{ left: closedLeft }}>
            <line x1="1" x2="1" y1="100%" y2="0" className="stroke-line-s" strokeWidth={2} strokeDasharray="6 4" />
          </svg>
        </>
      )}
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        {/* Muted lines first, so the winner draws over them. */}
        {[...drawn].sort((a, b) => Number(muted(b)) - Number(muted(a))).map((outcome) => (
          <path
            key={outcome.id}
            d={sparklinePath(outcome.id, plot)}
            fill="none"
            className={muted(outcome) ? 'stroke-line-s' : SERIES_STROKE[outcome.series]}
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {drawn.map((outcome) => (
        <span
          key={outcome.id}
          aria-hidden="true"
          className={cn('absolute size-2 -translate-1/2 rounded-full', muted(outcome) ? 'bg-line-s' : SERIES_BG[outcome.series])}
          style={{ left: `${xPercent(plot, plot.lineEnd)}%`, top: `${100 - (ended.shares[outcome.id] ?? 0) * 100}%` }}
        />
      ))}
    </div>
  )
}
