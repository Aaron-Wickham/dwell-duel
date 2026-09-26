'use client'

import { useState, useSyncExternalStore, type CSSProperties } from 'react'
import { Line, LineChart, ReferenceArea, ReferenceLine, XAxis, YAxis } from 'recharts'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { SERIES_BG } from '@/components/markets/outcome-row'
import { formatDay } from '@/lib/markets/format-date'
import type { Series } from '@/lib/markets/outcome-series'
import { RANGE_MS, availableRanges, sliceRange, type RangeKey, type SeriesPoint } from '@/lib/markets/probability-series'
import { cn } from '@/lib/utils'

export type ChartOutcome = { id: string; label: string; series: Series }

const SERIES_TEXT: Record<Series, string> = {
  1: 'text-s1',
  2: 'text-s2',
  3: 'text-s3',
  4: 'text-s4',
  5: 'text-s5',
  6: 'text-s6',
}

const SERIES_HALO: Record<Series, string> = {
  1: 'ring-s1/22',
  2: 'ring-s2/22',
  3: 'ring-s3/22',
  4: 'ring-s4/22',
  5: 'ring-s5/22',
  6: 'ring-s6/22',
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const MIN_SPAN_MS = HOUR_MS
const TIME_TICKS_UNDER_MS = 36 * HOUR_MS
// Below a day of spacing between ticks, a date-only label repeats, so pack date+time instead.
const DATE_TICKS_UNDER_MS = 4 * DAY_MS
// The mockup gives a closed market's shaded zone 14% of the plot, however long ago it closed.
const ZONE_SHARE = 0.14
const TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1]
const GRID = [100, 75, 50, 25, 0]
// Plot heights and label spacing per breakpoint, from the phone and desktop artboards.
const PHONE = { height: 220, gap: 40 }
const DESKTOP = { height: 300, gap: 48 }
const LABEL_PAD = 20
const EMPTY_TEXT = 'No bets yet — the chart starts with the first bet.'

type Row = { t: number } & Record<string, number>

const subscribe = () => () => {}

// The server can't know the viewer's time zone, so it formats in UTC and the browser re-renders in local time.
function useTimeZone(): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => undefined,
    () => 'UTC',
  )
}

function formatTime(t: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(t).replace(':00', '')
}

function formatWeekday(t: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(t)
}

function percent(share: number | undefined): number {
  return Math.round((share ?? 0) * 100)
}

// Nothing moves after the close, so a closed market opens on its whole history.
function initialRange(ranges: RangeKey[], closed: boolean): RangeKey {
  return !closed && ranges.includes('1W') ? '1W' : 'All'
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

export function ProbabilityChart({
  outcomes,
  points,
  now,
  closedAt = null,
  resolvedLabel = null,
  compact = false,
}: {
  outcomes: ChartOutcome[]
  points: SeriesPoint[]
  now: number
  closedAt?: string | null
  resolvedLabel?: string | null
  compact?: boolean
}) {
  const timeZone = useTimeZone()
  const ranges = availableRanges(points, now)
  const closedMs = closedAt ? Date.parse(closedAt) : null
  const closed = closedMs !== null && closedMs <= now
  const [picked, setPicked] = useState<RangeKey>(() => initialRange(ranges, closed))
  const range = !compact && ranges.includes(picked) ? picked : initialRange(ranges, closed)

  const plotRight = compact ? 'right-0' : 'right-[76px] md:right-[128px]'
  const boxHeight = compact ? 'h-[84px]' : 'h-[220px] md:h-[300px]'
  const grid = compact ? [50] : GRID

  const gridLines = grid.map((p) => (
    <div key={p} aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: `${100 - p}%` }} />
  ))

  const last = points.at(-1)
  if (!last) {
    return (
      <div className={cn('relative', boxHeight)}>
        <div className={cn('absolute inset-y-0 left-0', plotRight)}>
          {gridLines}
          <p
            className={cn(
              'absolute inset-0 flex items-center justify-center px-4 text-center font-bold text-ink2',
              compact ? 'text-xs' : 'text-sm',
            )}
          >
            {EMPTY_TEXT}
          </p>
        </div>
      </div>
    )
  }

  const visible = sliceRange(points, range, now)
  const lastVisibleT = visible.at(-1)?.t ?? last.t
  const lineEnd = Math.max(closed ? closedMs : now, lastVisibleT)
  let start = range === 'All' ? (visible[0]?.t ?? last.t) : now - RANGE_MS[range]
  let end = now
  if (range === 'All' && closed) end = Math.min(now, lineEnd + ((lineEnd - start) * ZONE_SHARE) / (1 - ZONE_SHARE))
  if (end - start < MIN_SPAN_MS) start = end - MIN_SPAN_MS
  const xPercent = (t: number) => Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100))

  const keys = outcomes.map((_, index) => `o${index}`)
  const config: ChartConfig = Object.fromEntries(
    outcomes.map((outcome, index) => [keys[index], { label: outcome.label, color: `var(--s${outcome.series})` }]),
  )

  const rows: Row[] = []
  for (const point of visible) {
    const row: Row = { t: point.t }
    outcomes.forEach((outcome, index) => {
      row[keys[index]] = (point.shares[outcome.id] ?? 0) * 100
    })
    if (rows.at(-1)?.t === point.t) rows[rows.length - 1] = row
    else rows.push(row)
  }
  const lastRow = rows.at(-1)
  if (lastRow && lastRow.t < lineEnd) rows.push({ ...lastRow, t: lineEnd })

  const summary = `Chance over time. Now: ${outcomes.map((o) => `${o.label} ${percent(last.shares[o.id])}%`).join(', ')}.`
  const zoneLabel = resolvedLabel ? `Resolved: ${resolvedLabel}` : closedAt ? `Closed ${formatDay(closedAt, timeZone)}` : ''

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
  const ticks = TICK_FRACTIONS.map((fraction, index) => {
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

  const phoneTops = spreadLabels(outcomes.map((o) => (1 - (last.shares[o.id] ?? 0)) * PHONE.height), PHONE.height, PHONE.gap)
  const desktopTops = spreadLabels(
    outcomes.map((o) => (1 - (last.shares[o.id] ?? 0)) * DESKTOP.height),
    DESKTOP.height,
    DESKTOP.gap,
  )

  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink2">{points.length === 1 ? '1 bet' : `${points.length} bets`}</p>
          {ranges.length > 1 && (
            <ToggleGroup
              aria-label="Time range"
              value={[range]}
              onValueChange={(value) => {
                if (value[0]) setPicked(value[0])
              }}
              className="flex gap-0.5 rounded-control bg-sunk p-[3px]"
            >
              {ranges.map((key) => (
                <Toggle
                  key={key}
                  value={key}
                  className="min-h-11 min-w-[52px] cursor-pointer rounded-[9px] px-3 text-sm font-extrabold text-ink2 data-pressed:bg-surface data-pressed:text-ink data-pressed:shadow-tab"
                >
                  {key}
                </Toggle>
              ))}
            </ToggleGroup>
          )}
        </div>
      )}
      <div className={cn('relative', boxHeight)}>
        <div role="img" aria-label={summary} className={cn('absolute inset-y-0 left-0', plotRight, !compact && 'cursor-crosshair')}>
          {gridLines}
          <ChartContainer config={config} initialDimension={{ width: -1, height: -1 }} className="absolute inset-0" aria-hidden="true">
            <LineChart data={rows} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <XAxis dataKey="t" type="number" domain={[start, end]} hide />
              <YAxis type="number" domain={[0, 100]} hide />
              {closed && <ReferenceArea x1={closedMs} x2={end} fill="var(--sunk)" fillOpacity={1} stroke="none" />}
              {closed && <ReferenceLine x={closedMs} stroke="var(--line-s)" strokeWidth={2} strokeDasharray="6 4" />}
              {!compact && (
                <ChartTooltip
                  isAnimationActive={false}
                  position={{ y: 8 }}
                  offset={14}
                  cursor={{ stroke: 'var(--line-s)', strokeWidth: 1.5 }}
                  content={<ChartTooltipContent labelFormatter={(t) => formatHover(Number(t))} valueFormatter={(v) => `${Math.round(v)}%`} />}
                />
              )}
              {keys.map((key) => (
                <Line
                  key={key}
                  dataKey={key}
                  type="stepAfter"
                  stroke={`var(--color-${key})`}
                  strokeWidth={compact ? 1.75 : 2.25}
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={compact ? false : { r: 6, fill: `var(--color-${key})`, stroke: 'var(--surface)', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
          {closed && zoneLabel && (
            <span
              aria-hidden="true"
              className="absolute top-2 right-1 text-xs leading-tight font-extrabold text-ink2"
              style={{ left: `calc(${xPercent(closedMs)}% + 8px)` }}
            >
              {zoneLabel}
            </span>
          )}
          {outcomes.map((outcome) => (
            <span
              key={outcome.id}
              aria-hidden="true"
              className={cn(
                'absolute -translate-1/2 rounded-full',
                SERIES_BG[outcome.series],
                SERIES_HALO[outcome.series],
                compact ? 'size-2 ring-3' : 'size-2.5 ring-5',
              )}
              style={{ left: `${xPercent(lineEnd)}%`, top: `${100 - (last.shares[outcome.id] ?? 0) * 100}%` }}
            />
          ))}
        </div>
        {!compact && (
          <div aria-hidden="true" className="absolute inset-y-0 right-0 w-[76px] md:w-[128px]">
            {outcomes.map((outcome, index) => (
              <div
                key={outcome.id}
                className={cn(
                  'absolute left-3.5 top-(--label-top) -translate-y-1/2 leading-[1.05] md:top-(--label-top-md)',
                  SERIES_TEXT[outcome.series],
                )}
                style={{ '--label-top': `${phoneTops[index]}px`, '--label-top-md': `${desktopTops[index]}px` } as CSSProperties}
              >
                <div className="text-[13px] font-bold">{outcome.label}</div>
                <div className="text-xl font-extrabold tracking-[-0.02em] tabular-nums md:text-[26px]">
                  {percent(last.shares[outcome.id])}%
                </div>
              </div>
            ))}
            {GRID.map((p) => (
              <span
                key={p}
                className="absolute right-0 hidden -translate-y-1/2 text-[11px] font-bold text-ink2 md:block"
                style={{ top: `${100 - p}%` }}
              >
                {p}%
              </span>
            ))}
          </div>
        )}
      </div>
      {!compact && (
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
      )}
    </div>
  )
}
