import type { ChartOutcome } from '@/components/markets/probability-chart'
import { SERIES_BG, SERIES_HALO, SERIES_STROKE } from '@/components/markets/series-classes'
import { LocalTime } from '@/components/ui/local-time'
import { chartWindow, initialRange, xPercent } from '@/lib/markets/chart-window'
import { availableRanges, type SeriesPoint } from '@/lib/markets/probability-series'
import { sparklinePath } from '@/lib/markets/sparkline'
import { cn } from '@/lib/utils'

const EMPTY_TEXT = 'No bets were placed on this market.'

function percent(share: number | undefined): number {
  return Math.round((share ?? 0) * 100)
}

// A market card's chart: the full ProbabilityChart's window and colours, drawn as plain SVG so
// the markets list server-renders it and ships no charting library.
export function MarketSparkline({
  outcomes,
  points,
  now,
  closedAt,
  resolvedLabel = null,
}: {
  outcomes: ChartOutcome[]
  points: SeriesPoint[]
  now: number
  closedAt: string
  resolvedLabel?: string | null
}) {
  const closedMs = Date.parse(closedAt)
  const closed = closedMs <= now
  const plot = chartWindow(points, initialRange(availableRanges(points, now), closed), now, closedMs)
  const last = points.at(-1)

  const gridLine = <div aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-dashed border-line" />

  if (!plot || !last) {
    return (
      <div className="relative h-[84px]">
        {gridLine}
        <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs font-bold text-ink2">{EMPTY_TEXT}</p>
      </div>
    )
  }

  const summary = `Chance over time. Now: ${outcomes.map((o) => `${o.label} ${percent(last.shares[o.id])}%`).join(', ')}.`
  const closedLeft = `${xPercent(plot, closedMs)}%`

  return (
    <div role="img" aria-label={summary} className="relative h-[84px]">
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
        {outcomes.map((outcome) => (
          <path
            key={outcome.id}
            d={sparklinePath(outcome.id, plot)}
            fill="none"
            className={SERIES_STROKE[outcome.series]}
            strokeWidth={1.75}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {closed && (
        <span
          aria-hidden="true"
          className="absolute top-2 right-1 text-xs leading-tight font-extrabold text-ink2"
          style={{ left: `calc(${closedLeft} + 8px)` }}
        >
          {resolvedLabel ? (
            `Resolved: ${resolvedLabel}`
          ) : (
            <>
              Closed <LocalTime iso={closedAt} format="day" />
            </>
          )}
        </span>
      )}
      {outcomes.map((outcome) => (
        <span
          key={outcome.id}
          aria-hidden="true"
          className={cn('absolute size-2 -translate-1/2 rounded-full ring-3', SERIES_BG[outcome.series], SERIES_HALO[outcome.series])}
          style={{ left: `${xPercent(plot, plot.lineEnd)}%`, top: `${100 - (last.shares[outcome.id] ?? 0) * 100}%` }}
        />
      ))}
    </div>
  )
}
