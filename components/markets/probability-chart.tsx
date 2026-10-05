'use client'

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Line, LineChart, ReferenceArea, ReferenceLine, XAxis, YAxis } from 'recharts'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { useTimeZone } from '@/components/ui/local-time'
import { SERIES_BG } from '@/components/markets/series-classes'
import { describeMovement } from '@/lib/markets/chart-summary'
import { chartWindow, initialRange, PX_PER_POINT, xPercent as windowXPercent } from '@/lib/markets/chart-window'
import { formatDay } from '@/lib/markets/format-date'
import type { MarketKind } from '@/lib/markets/kind'
import { plottedOutcomes, type Series } from '@/lib/markets/outcome-series'
import { availableRanges, type RangeKey, type SeriesPoint } from '@/lib/markets/probability-series'
import { cn } from '@/lib/utils'
import { chipTextClass, microTextClass, figureClass } from '@/components/ui/page'
import { SegmentedControl, segmentClass, segmentMarker } from '@/components/ui/segmented-control'

export type ChartOutcome = { id: string; label: string; series: Series }

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const TIME_TICKS_UNDER_MS = 36 * HOUR_MS
// Below a day of spacing between ticks, a date-only label repeats, so pack date+time instead.
const DATE_TICKS_UNDER_MS = 4 * DAY_MS
const TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1]
const GRID = [100, 75, 50, 25, 0]
// The y ticks sit inside the plot's left edge, clear of the end labels in the right gutter.
const Y_TICKS = [75, 50, 25]
// Plot heights per breakpoint, from the phone and desktop artboards, and the least distance
// between two end labels' centres: a label's height plus 4px (#391). A label is the name line
// (13px at 1.05) over its figure (24px, 28px from md, at 1.25): 44px on a phone, 49px from md.
const PHONE = { height: 220, gap: 48 }
const DESKTOP = { height: 300, gap: 53 }
// When the full labels can't all fit, each folds to its one name line with the figure beside it.
const COMPACT_GAP = 18
const LABEL_PAD = 20
// An end label moved further than this from its line's end gets a leader back to it.
const LEADER_MIN_PX = 4
// Before the plot has been measured, thin to about a phone plot's width.
const UNMEASURED_BUCKETS = 80
// A seeded market's series always has its opening point (0041), so only a market that closed
// before seeding, with no bets on it, has nothing to draw.
const EMPTY_TEXT = 'No bets were placed on this market.'

type Row = { t: number } & Record<string, number>

function formatTime(t: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(t).replace(':00', '')
}

function formatWeekday(t: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(t)
}

function percent(share: number | undefined): number {
  return Math.round((share ?? 0) * 100)
}

// Whether `count` end labels fit the plot's height at full size.
export function labelsFit(count: number, height: number, gap: number): boolean {
  return count <= 1 || (count - 1) * gap <= height - 2 * LABEL_PAD
}

// Pushes end labels apart so they never overlap, keeping each as close to its line as it can.
export function spreadLabels(targets: number[], height: number, gap: number): number[] {
  const min = LABEL_PAD
  const max = height - LABEL_PAD
  const step = targets.length > 1 ? Math.min(gap, (max - min) / (targets.length - 1)) : 0
  const order = targets.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y)
  const ys: number[] = []
  let previous = -Infinity
  for (const { y } of order) {
    previous = Math.max(y, min, previous + step)
    ys.push(previous)
  }
  let next = Infinity
  for (let k = ys.length - 1; k >= 0; k--) {
    ys[k] = Math.min(ys[k], max, next - step)
    next = ys[k]
  }
  const tops: number[] = []
  order.forEach(({ index }, k) => {
    tops[index] = ys[k]
  })
  return tops
}

// The plot's measured width, so the series can be thinned to about a point every few pixels.
function usePlotWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

// Leader lines from each line's end, at the gutter's left edge, to its label when the label moved.
function Leaders({ targets, tops, height, className }: { targets: number[]; tops: number[]; height: number; className: string }) {
  return (
    <svg aria-hidden="true" width={12} height={height} className={cn('absolute top-0 left-0 overflow-visible', className)}>
      {targets.map((target, index) =>
        Math.abs(tops[index] - target) > LEADER_MIN_PX ? (
          <polyline
            key={index}
            points={`0,${target} 8,${tops[index]} 12,${tops[index]}`}
            fill="none"
            className="stroke-line-s"
            strokeWidth={1}
          />
        ) : null,
      )}
    </svg>
  )
}

export function ProbabilityChart({
  kind,
  outcomes,
  points,
  rangeSeries,
  now,
  closedAt = null,
  resolvedLabel = null,
  betCount = points.length,
}: {
  kind: MarketKind
  outcomes: ChartOutcome[]
  // The whole history: it decides which ranges are offered, and draws any range without its own series.
  points: SeriesPoint[]
  // Each range's own series, bucketed by time in SQL (market_series, 0110), so a day reads at a
  // day's resolution rather than as a slice of the whole history's points.
  rangeSeries?: Partial<Record<RangeKey, SeriesPoint[]>>
  now: number
  closedAt?: string | null
  resolvedLabel?: string | null
  // A seeded market's series opens with a point before any bet (0041), so the caption counts bets, not points.
  betCount?: number
}) {
  const timeZone = useTimeZone()
  const [plotRef, plotWidth] = usePlotWidth()
  const ranges = availableRanges(points, now)
  const closedMs = closedAt ? Date.parse(closedAt) : null
  const closed = closedMs !== null && closedMs <= now
  const [picked, setPicked] = useState<RangeKey>(() => initialRange(ranges, closed))
  // The plotted point the keyboard is on, or null while nobody has stepped (the chart then reads as now).
  const [keyStep, setKeyStep] = useState<number | null>(null)
  const range = ranges.includes(picked) ? picked : initialRange(ranges, closed)

  const gridLines = GRID.map((p) => (
    <div key={p} aria-hidden="true" className="absolute inset-x-0 border-t border-line" style={{ top: `${100 - p}%` }} />
  ))

  const last = points.at(-1)
  // Ticks that would repeat a minute-precise label are dropped below, instead of padding a young
  // market's span out with empty time.
  const buckets = plotWidth > 0 ? Math.floor(plotWidth / PX_PER_POINT) : UNMEASURED_BUCKETS
  const plot = chartWindow(rangeSeries?.[range] ?? points, range, now, closedMs, buckets)
  if (!last || !plot) {
    return (
      <div className="relative h-[220px] md:h-[300px]">
        <div className="absolute inset-y-0 right-[76px] left-0 md:right-[128px]">
          {gridLines}
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm font-bold text-ink2">
            {EMPTY_TEXT}
          </p>
        </div>
      </div>
    )
  }

  const { visible, start, end, lineEnd } = plot
  const xPercent = (t: number) => windowXPercent(plot, t)
  const ended = visible.at(-1) ?? last

  const drawn = plottedOutcomes(kind, outcomes)
  // One line is the market's own, so it keeps its colour whoever won; of several, the losers grey.
  const muted = (outcome: ChartOutcome) => resolvedLabel !== null && drawn.length > 1 && outcome.label !== resolvedLabel
  const keys = drawn.map((_, index) => `o${index}`)
  const config: ChartConfig = Object.fromEntries(
    drawn.map((outcome, index) => [keys[index], { label: outcome.label, color: muted(outcome) ? 'var(--line-s)' : `var(--s${outcome.series})` }]),
  )
  // Muted lines draw first, so the winner sits on top.
  const drawOrder = drawn.map((outcome, index) => ({ outcome, key: keys[index] })).sort((a, b) => Number(muted(b.outcome)) - Number(muted(a.outcome)))

  const rows: Row[] = []
  for (const point of visible) {
    const row: Row = { t: point.t }
    drawn.forEach((outcome, index) => {
      row[keys[index]] = (point.shares[outcome.id] ?? 0) * 100
    })
    if (rows.at(-1)?.t === point.t) rows[rows.length - 1] = row
    else rows.push(row)
  }
  const lastRow = rows.at(-1)
  if (lastRow && lastRow.t < lineEnd) rows.push({ ...lastRow, t: lineEnd })

  const summary = describeMovement(drawn, plot, range)
  const closedNote = closed && closedAt ? `Closed ${formatDay(closedAt, timeZone)}` : null

  const span = lineEnd - start
  const formatDateAndTime = (t: number) => `${formatDay(new Date(t).toISOString(), timeZone)}, ${formatTime(t, timeZone)}`
  const formatTick = (t: number) => {
    if (span <= TIME_TICKS_UNDER_MS) return formatTime(t, timeZone)
    // Under four days, evenly spaced ticks land less than a day apart, so a date-only label would repeat.
    if (span <= DATE_TICKS_UNDER_MS) return formatDateAndTime(t)
    return formatDay(new Date(t).toISOString(), timeZone)
  }
  const formatHover = (t: number) => {
    if (t === lineEnd && !closed) return 'Now'
    if (span <= TIME_TICKS_UNDER_MS) return `${formatWeekday(t, timeZone)} ${formatTime(t, timeZone)}`
    return formatDateAndTime(t)
  }
  const allTicks = TICK_FRACTIONS.map((fraction, index) => {
    const t = start + fraction * (lineEnd - start)
    const left = xPercent(t)
    return {
      key: fraction,
      label: index === TICK_FRACTIONS.length - 1 && !closed ? 'Now' : formatTick(t),
      left,
      shift: index === 0 ? '' : left >= 95 ? '-translate-x-full' : '-translate-x-1/2',
      // Five labels overlap in a phone-width plot, so phones keep the start, middle and end.
      phone: index % 2 === 0,
    }
  })
  // Over a span of a few minutes, evenly spaced minute-precise ticks land on the same label. Keep
  // the end tick, and each earlier one only where its label is new.
  const endLabel = allTicks[allTicks.length - 1].label
  const ticks = allTicks.filter(
    (tick, index) =>
      index === allTicks.length - 1 || (tick.label !== endLabel && (index === 0 || tick.label !== allTicks[index - 1].label)),
  )

  // What each end label says: the chance, or after a resolution "Yes won" for the winner (a
  // two-outcome chart's one line carries the winner's name, whichever side won).
  const endLabels = drawn.map((outcome) => {
    const pct = `${percent(ended.shares[outcome.id])}%`
    if (resolvedLabel === null) return { name: outcome.label, figure: pct, quiet: false }
    if (drawn.length === 1) return { name: resolvedLabel, figure: 'won', quiet: false }
    return outcome.label === resolvedLabel ? { name: outcome.label, figure: 'won', quiet: false } : { name: outcome.label, figure: pct, quiet: true }
  })
  // For the keyboard the plot is a slider over the plotted points, as the race chart is (#418):
  // arrow keys, Page Up/Down, Home and End step through them, each step shows a readout like the
  // hover's, and a polite live region reads out every line's chance there.
  const lastStep = Math.max(0, rows.length - 1)
  // A live refresh can shorten the series under the keyboard.
  const active = keyStep === null ? null : Math.min(keyStep, lastStep)
  const pageStep = Math.max(1, Math.round(lastStep / 10))
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const from = active ?? lastStep
    const moves: Partial<Record<string, number>> = {
      ArrowLeft: from - 1,
      ArrowDown: from - 1,
      ArrowRight: from + 1,
      ArrowUp: from + 1,
      PageDown: from - pageStep,
      PageUp: from + pageStep,
      Home: 0,
      End: lastStep,
    }
    const to = moves[e.key]
    // Leave the browser's and the screen reader's own shortcuts alone.
    if (to === undefined || e.altKey || e.ctrlKey || e.metaKey || rows.length === 0) return
    e.preventDefault()
    setKeyStep(Math.max(0, Math.min(lastStep, to)))
  }
  const chancesAt = (step: number) =>
    drawn
      .map((outcome, index) => ({ outcome, value: Math.round(rows[step][keys[index]]) }))
      .sort((a, b) => b.value - a.value)
  const activeRow = active === null ? null : rows[active]

  const phoneTargets = drawn.map((o) => (1 - (ended.shares[o.id] ?? 0)) * PHONE.height)
  const desktopTargets = drawn.map((o) => (1 - (ended.shares[o.id] ?? 0)) * DESKTOP.height)
  const compactPhone = !labelsFit(drawn.length, PHONE.height, PHONE.gap)
  const compactDesktop = !labelsFit(drawn.length, DESKTOP.height, DESKTOP.gap)
  const phoneTops = spreadLabels(phoneTargets, PHONE.height, compactPhone ? COMPACT_GAP : PHONE.gap)
  const desktopTops = spreadLabels(desktopTargets, DESKTOP.height, compactDesktop ? COMPACT_GAP : DESKTOP.gap)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink2">
          {betCount === 1 ? '1 bet' : `${betCount.toLocaleString('en-US')} bets`}
          {closedNote && ` · ${closedNote}`}
        </p>
        {ranges.length > 1 && (
          <SegmentedControl activeKey={range}>
            {/* contents, so the segments sit on the control's track and its pill can measure them. */}
            <ToggleGroup
              aria-label="Time range"
              value={[range]}
              onValueChange={(value) => {
                if (value[0]) {
                  setPicked(value[0])
                  setKeyStep(null)
                }
              }}
              className="contents"
            >
              {ranges.map((key) => (
                <Toggle key={key} value={key} {...segmentMarker(range === key)} className={cn(segmentClass(range === key), 'min-w-[52px] text-sm font-extrabold')}>
                  {key}
                </Toggle>
              ))}
            </ToggleGroup>
          </SegmentedControl>
        )}
      </div>
      <div className="relative h-[220px] md:h-[300px]">
        <div
          ref={plotRef}
          role="slider"
          tabIndex={0}
          aria-label={summary}
          aria-valuemin={0}
          aria-valuemax={lastStep}
          aria-valuenow={active ?? lastStep}
          aria-valuetext={rows.length > 0 ? formatHover(rows[active ?? lastStep].t) : undefined}
          onKeyDown={onKeyDown}
          onBlur={() => setKeyStep(null)}
          // The pointer's own tooltip takes over from the keyboard's readout.
          onPointerMove={() => setKeyStep(null)}
          onPointerDown={() => setKeyStep(null)}
          className="absolute inset-y-0 right-[76px] left-0 cursor-crosshair rounded-control md:right-[128px]"
        >
          {gridLines}
          {Y_TICKS.map((p) => (
            <span
              key={p}
              aria-hidden="true"
              className={`absolute left-0 -translate-y-full rounded-segment bg-surface/85 px-0.5 ${microTextClass} font-bold text-ink2`}
              style={{ top: `${100 - p}%` }}
            >
              {p}%
            </span>
          ))}
          <ChartContainer config={config} initialDimension={{ width: -1, height: -1 }} className="absolute inset-0" aria-hidden="true">
            <LineChart data={rows} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <XAxis dataKey="t" type="number" domain={[start, end]} hide />
              <YAxis type="number" domain={[0, 100]} hide />
              {closed && <ReferenceArea x1={closedMs} x2={end} fill="var(--sunk)" fillOpacity={1} stroke="none" />}
              {closed && <ReferenceLine x={closedMs} stroke="var(--line-s)" strokeWidth={2} strokeDasharray="6 4" />}
              <ChartTooltip
                isAnimationActive={false}
                offset={14}
                cursor={{ stroke: 'var(--line-s)', strokeWidth: 1.5 }}
                content={(props) => (
                  <ChartTooltipContent
                    active={props.active}
                    label={props.label}
                    payload={[...(props.payload ?? [])].sort((a, b) => Number(b.value) - Number(a.value))}
                    labelFormatter={(t) => formatHover(Number(t))}
                    valueFormatter={(v) => `${Math.round(v)}%`}
                  />
                )}
              />
              {drawOrder.map(({ key }) => (
                <Line
                  key={key}
                  dataKey={key}
                  type="stepAfter"
                  stroke={`var(--color-${key})`}
                  strokeWidth={2.25}
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={{ r: 6, fill: `var(--color-${key})`, stroke: 'var(--surface)', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
          {drawn.map((outcome) => (
            <span
              key={outcome.id}
              aria-hidden="true"
              className={cn('absolute size-2.5 -translate-1/2 rounded-full', muted(outcome) ? 'bg-line-s' : SERIES_BG[outcome.series])}
              style={{ left: `${xPercent(lineEnd)}%`, top: `${100 - (ended.shares[outcome.id] ?? 0) * 100}%` }}
            />
          ))}
          {activeRow !== null && active !== null && (
            <div aria-hidden="true" data-testid="chart-key-readout">
              <div className="absolute inset-y-0 w-[1.5px] -translate-x-1/2 bg-line-s" style={{ left: `${xPercent(activeRow.t)}%` }} />
              {drawn.map((outcome, index) => (
                <span
                  key={outcome.id}
                  className={cn(
                    'absolute size-3 -translate-1/2 rounded-full border-2 border-surface',
                    muted(outcome) ? 'bg-line-s' : SERIES_BG[outcome.series],
                  )}
                  style={{ left: `${xPercent(activeRow.t)}%`, top: `${100 - activeRow[keys[index]]}%` }}
                />
              ))}
              {/* The tooltip's look, beside the cursor while there's room to its right and pinned to
                  the plot's right edge once there isn't. A phone's plot is too narrow for it, as in
                  the race; the live region still reads each step. */}
              <div
                className={cn(
                  'absolute top-2 hidden min-w-[140px] flex-col gap-1.5 rounded-control border border-line bg-surface px-3 py-2.5 text-ink shadow-card md:flex',
                  xPercent(activeRow.t) > 50 ? 'right-0' : 'ml-3.5',
                )}
                style={xPercent(activeRow.t) > 50 ? undefined : { left: `${xPercent(activeRow.t)}%` }}
              >
                <span className="whitespace-nowrap text-xs font-bold text-ink2">{formatHover(activeRow.t)}</span>
                {chancesAt(active).map(({ outcome, value }) => (
                  <div key={outcome.id} className="flex items-center gap-2 text-sm">
                    <span className={cn('size-2 shrink-0 rounded-full', muted(outcome) ? 'bg-line-s' : SERIES_BG[outcome.series])} />
                    <span className="grow">{outcome.label}</span>
                    <strong className="tabular-nums">{value}%</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <p aria-live="polite" className="sr-only" data-testid="chart-announcer">
          {active === null
            ? ''
            : `${formatHover(rows[active].t)}: ${chancesAt(active)
                .map(({ outcome, value }) => `${outcome.label} ${value}%`)
                .join(', ')}`}
        </p>
        <div aria-hidden="true" className="absolute inset-y-0 right-0 w-[76px] md:w-[128px]">
          <Leaders targets={phoneTargets} tops={phoneTops} height={PHONE.height} className="md:hidden" />
          <Leaders targets={desktopTargets} tops={desktopTops} height={DESKTOP.height} className="hidden md:block" />
          {drawn.map((outcome, index) => (
            <div
              key={outcome.id}
              data-slot="end-label"
              className={cn(
                'absolute left-3.5 top-(--label-top) -translate-y-1/2 leading-[1.05] md:top-(--label-top-md)',
                endLabels[index].quiet ? 'text-ink2' : 'text-ink',
              )}
              style={{ '--label-top': `${phoneTops[index]}px`, '--label-top-md': `${desktopTops[index]}px` } as CSSProperties}
            >
              {/* Bounded so `truncate` has a width to cut off at -- the 76px/128px gutter minus this label's left-3.5 inset. */}
              <div className={`flex w-[62px] items-center gap-1 ${chipTextClass} font-bold md:w-[114px]`}>
                <span className={cn('size-2 shrink-0 rounded-full', muted(outcome) ? 'bg-line-s' : SERIES_BG[outcome.series])} />
                <span className="min-w-0 truncate">{endLabels[index].name}</span>
                {(compactPhone || compactDesktop) && (
                  <span className={cn('shrink-0', !compactPhone && 'max-md:hidden', !compactDesktop && 'md:hidden')}>{endLabels[index].figure}</span>
                )}
              </div>
              {!(compactPhone && compactDesktop) && (
                <div className={cn(figureClass, compactPhone && 'max-md:hidden', compactDesktop && 'md:hidden')}>{endLabels[index].figure}</div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div data-slot="ticks" aria-hidden="true" className="relative mr-[76px] h-5 text-xs font-bold text-ink2 md:mr-[128px]">
        {ticks.map((tick) => (
          <span
            key={tick.key}
            className={cn('absolute top-0 whitespace-nowrap', tick.shift, !tick.phone && 'hidden md:block')}
            style={{ left: `${tick.left}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      {/* The plotted points as a table, for a screen reader to step through. */}
      <table className="sr-only">
        <caption>Chance at each move, {range === 'All' ? 'whole history' : range === '1W' ? 'last week' : 'last day'}</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            {drawn.map((outcome) => (
              <th key={outcome.id} scope="col">
                {outcome.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.t}>
              <th scope="row">{formatHover(row.t)}</th>
              {keys.map((key) => (
                <td key={key}>{Math.round(row[key])}%</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
