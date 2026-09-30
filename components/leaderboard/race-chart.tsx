'use client'

import { useState, type CSSProperties, type KeyboardEvent } from 'react'
import { ArrowDown, ArrowUp, Flag } from 'lucide-react'
import { Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionCard } from '@/components/ui/section-card'
import { useTimeZone } from '@/components/ui/local-time'
import { exitStep, raceLayout } from '@/components/leaderboard/race-layout'
import { formatDay } from '@/lib/markets/format-date'
import type { RaceSeries } from '@/lib/social/leaderboard-extras'
import { signedDc } from '@/lib/social/season'
import { cn } from '@/lib/utils'

// Plot heights and label spacing per breakpoint. On desktop the chart sits in the leaderboard's
// side column, so it is only a little wider than on a phone.
const PHONE = { height: 220, gap: 40 }
const DESKTOP = { height: 260, gap: 44 }
// The line's room above and below, so a peak isn't cut at the edge.
const PAD = 12
const SERIES_TEXT = ['text-s1', 'text-s2', 'text-s3', 'text-s4', 'text-s5', 'text-s6'] as const
const SERIES_BG = ['bg-s1', 'bg-s2', 'bg-s3', 'bg-s4', 'bg-s5', 'bg-s6'] as const

type Row = { step: number } & Record<string, number>

// The end labels have room for about eight characters, so they carry the first name; the readout
// and the slider's label keep the whole name.
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0]
}

function formatMoment(iso: string, timeZone?: string): string {
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso))
  return `${formatDay(iso, timeZone)}, ${time}`
}

// Step lines because profit only moves when a bet is placed or settles, as the market charts do.
// The x axis is the moments the totals moved, evenly spaced from the month's first settled bet, so
// a burst of settlements on one day reads as its own steps rather than one jump. A runaway leader
// or last place runs off that edge (race-layout.ts) so everyone else stays readable; the readout
// and its end label still give the true total.
//
// For the keyboard it is a slider over the moments: arrow keys, Page Up/Down, Home and End step
// through them, each step shows the readout that hover and tap show, and a polite live region
// reads out everyone's total there.
export function RaceChart({ series }: { series: RaceSeries[] }) {
  const timeZone = useTimeZone()
  // The moment the keyboard is on, or null while nobody has stepped (the chart then reads as now).
  const [keyStep, setKeyStep] = useState<number | null>(null)

  if (series.length === 0) {
    return (
      <SectionCard title="The race" titleId="leaderboard-race">
        <EmptyState icon={Flag} title="The race starts once bets settle.">
          Then each of the month’s top five gets a line that steps up or down as their bets pay out.
        </EmptyState>
      </SectionCard>
    )
  }

  // Every value holds until the next move, and the last holds until now, so each step, the
  // latest included, gets its own width instead of the newest being a jump at the edge.
  const points = series.map((s) => [...s.points, s.points[s.points.length - 1]])
  const moments = points[0].map((p) => p.at)
  const last = moments.length - 1

  const keys = series.map((_, i) => `m${i}`)
  const config: ChartConfig = Object.fromEntries(series.map((s, i) => [keys[i], { label: s.name, color: `var(--s${(i % 6) + 1})` }]))
  const rows: Row[] = moments.map((_, step) => ({ step, ...Object.fromEntries(points.map((p, i) => [keys[i], p[step].profit])) }))

  const values = points.map((p) => p.map((point) => point.profit))
  const phone = raceLayout(values, { height: PHONE.height, pad: PAD, gap: PHONE.gap })
  const desktop = raceLayout(values, { height: DESKTOP.height, pad: PAD, gap: DESKTOP.gap })
  const { low, high, clippedTop, clippedBottom } = phone
  const exitTop = clippedTop === null ? null : exitStep(values[clippedTop], high, 'top')
  const exitBottom = clippedBottom === null ? null : exitStep(values[clippedBottom], low, 'bottom')
  const xPercent = (step: number) => (last === 0 ? 100 : (step / last) * 100)

  const momentLabel = (step: number) =>
    step === 0 ? 'Before the first settlement' : step === last ? 'Now' : formatMoment(moments[step], timeZone)
  // Everyone's total at a moment, best first, as the readout lists them.
  const standings = (step: number) =>
    series.map((s, i) => ({ i, name: s.name, profit: values[i][step] })).sort((a, b) => b.profit - a.profit || a.i - b.i)

  // A live refresh can shorten the race under the keyboard.
  const active = keyStep === null ? null : Math.min(keyStep, last)
  const page = Math.max(1, Math.round(last / 10))
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const from = active ?? last
    const moves: Partial<Record<string, number>> = {
      ArrowLeft: from - 1,
      ArrowDown: from - 1,
      ArrowRight: from + 1,
      ArrowUp: from + 1,
      PageDown: from - page,
      PageUp: from + page,
      Home: 0,
      End: last,
    }
    const to = moves[e.key]
    // Leave the browser's and the screen reader's own shortcuts alone.
    if (to === undefined || e.altKey || e.ctrlKey || e.metaKey) return
    e.preventDefault()
    setKeyStep(Math.max(0, Math.min(last, to)))
  }

  const summary = series.map((s) => `${s.name} ${signedDc(s.final)}`).join(', ')
  const clippedNotes = [
    clippedTop === null
      ? null
      : series[clippedTop].final > high
        ? `${series[clippedTop].name} is off the top at ${signedDc(series[clippedTop].final)}`
        : `${series[clippedTop].name}’s peak of ${signedDc(Math.max(...values[clippedTop]))} runs off the top`,
    clippedBottom === null
      ? null
      : series[clippedBottom].final < low
        ? `${series[clippedBottom].name} is off the bottom at ${signedDc(series[clippedBottom].final)}`
        : `${series[clippedBottom].name}’s low of ${signedDc(Math.min(...values[clippedBottom]))} runs off the bottom`,
  ].filter((note) => note !== null)
  const clippedNote = clippedNotes.length === 0 ? null : `${clippedNotes.join(' and ')}, so everyone else stays readable.`

  return (
    <SectionCard title="The race" titleId="leaderboard-race">
      <p className="text-sm text-ink2">
        Net betting profit for this month’s top {series.length}, move by move since the first bet settled.
      </p>
      <div className="flex flex-col gap-2">
        <div className="relative h-[220px] md:h-[260px]">
          <div
            role="slider"
            tabIndex={0}
            aria-label={`Net betting profit this month: ${summary}`}
            aria-valuemin={0}
            aria-valuemax={last}
            aria-valuenow={active ?? last}
            aria-valuetext={momentLabel(active ?? last)}
            onKeyDown={onKeyDown}
            onBlur={() => setKeyStep(null)}
            // The pointer's own readout takes over from the keyboard's.
            onPointerMove={() => setKeyStep(null)}
            onPointerDown={() => setKeyStep(null)}
            className="absolute inset-y-0 right-[96px] left-0 cursor-crosshair rounded-control md:right-[120px]"
          >
            {exitTop !== null && (
              <>
                <div aria-hidden="true" className="absolute inset-x-0 top-0 border-t-2 border-dashed border-line-s" />
                <ArrowUp
                  aria-hidden="true"
                  data-testid="race-exit"
                  strokeWidth={3}
                  className={cn('absolute top-0 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface', SERIES_TEXT[clippedTop! % 6])}
                  style={{ left: `${xPercent(exitTop)}%` }}
                />
              </>
            )}
            {exitBottom !== null && (
              <>
                <div aria-hidden="true" className="absolute inset-x-0 bottom-0 border-b-2 border-dashed border-line-s" />
                <ArrowDown
                  aria-hidden="true"
                  data-testid="race-exit-bottom"
                  strokeWidth={3}
                  className={cn(
                    'absolute bottom-0 size-4 -translate-x-1/2 translate-y-1/2 rounded-full bg-surface',
                    SERIES_TEXT[clippedBottom! % 6],
                  )}
                  style={{ left: `${xPercent(exitBottom)}%` }}
                />
              </>
            )}
            <ChartContainer config={config} initialDimension={{ width: -1, height: -1 }} className="absolute inset-0" aria-hidden="true">
              <LineChart data={rows} margin={{ top: PAD, right: 0, bottom: PAD, left: 0 }} accessibilityLayer={false}>
                <XAxis dataKey="step" type="number" domain={[0, last]} hide />
                <YAxis type="number" domain={[low, high]} allowDataOverflow hide />
                <ReferenceLine y={0} stroke="var(--line-s)" strokeDasharray="4 4" />
                <ChartTooltip
                  isAnimationActive={false}
                  position={{ y: 8 }}
                  offset={14}
                  cursor={{ stroke: 'var(--line-s)', strokeWidth: 1.5 }}
                  content={(props) => (
                    <ChartTooltipContent
                      active={props.active}
                      label={props.label}
                      payload={[...(props.payload ?? [])].sort((a, b) => Number(b.value) - Number(a.value))}
                      labelFormatter={(step) => momentLabel(Number(step))}
                      valueFormatter={signedDc}
                    />
                  )}
                />
                {keys.map((key) => (
                  <Line
                    key={key}
                    dataKey={key}
                    type="stepAfter"
                    stroke={`var(--color-${key})`}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 5, fill: `var(--color-${key})`, stroke: 'var(--surface)', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ChartContainer>
            {active !== null && (
              <div aria-hidden="true" data-testid="race-key-readout">
                <div className="absolute inset-y-0 w-[1.5px] -translate-x-1/2 bg-line-s" style={{ left: `${xPercent(active)}%` }} />
                {/* The hover readout's look, beside the cursor while there's room to its right and
                    pinned to the plot's right edge once there isn't, so on a narrow phone it never
                    runs under the label column. */}
                <div
                  className={cn(
                    'absolute top-2 flex min-w-[150px] flex-col gap-1.5 rounded-control border border-line bg-surface px-3 py-2.5 text-ink shadow-card',
                    xPercent(active) > 40 ? 'right-0' : 'ml-3.5',
                  )}
                  style={xPercent(active) > 40 ? undefined : { left: `${xPercent(active)}%` }}
                >
                  <span className="whitespace-nowrap text-xs font-bold text-ink2">{momentLabel(active)}</span>
                  {standings(active).map(({ i, name, profit }) => (
                    <div key={series[i].id} className="flex items-center gap-2 text-sm">
                      <span className={cn('size-2 shrink-0 rounded-full', SERIES_BG[i % 6])} />
                      <span className="grow">{name}</span>
                      <strong className="tabular-nums">{signedDc(profit)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <p aria-live="polite" className="sr-only" data-testid="race-announcer">
            {active === null
              ? ''
              : standings(active)
                  .map(({ name, profit }) => `${name} ${signedDc(profit)}`)
                  .join(', ')}
          </p>
          <ul aria-hidden="true" className="absolute inset-y-0 right-0 w-[96px] md:w-[120px]">
            {series.map((s, i) => {
              const phoneTop = phone.labelTops[i]
              const desktopTop = desktop.labelTops[i]
              if (phoneTop === null && desktopTop === null) return null
              return (
                <li
                  key={s.id}
                  className={cn(
                    'absolute left-2.5 top-(--label-top) flex w-[86px] -translate-y-1/2 flex-col leading-[1.1] md:top-(--label-top-md) md:w-[110px]',
                    phoneTop === null && 'hidden md:flex',
                    desktopTop === null && 'md:hidden',
                    SERIES_TEXT[i % 6],
                  )}
                  style={{ '--label-top': `${phoneTop ?? 0}px`, '--label-top-md': `${desktopTop ?? 0}px` } as CSSProperties}
                >
                  <span className="truncate text-sm font-bold">{firstName(s.name)}</span>
                  <span className="flex items-center gap-0.5 text-base font-extrabold tabular-nums md:text-lg">
                    {s.final > high && <ArrowUp data-testid="race-off-top" strokeWidth={3} className="size-3.5 shrink-0" />}
                    {s.final < low && <ArrowDown data-testid="race-off-bottom" strokeWidth={3} className="size-3.5 shrink-0" />}
                    {signedDc(s.final)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
        <div aria-hidden="true" className="flex justify-between pr-[96px] text-xs font-bold text-ink2 md:pr-[120px]">
          <span>{formatDay(moments[0], timeZone)}</span>
          <span>Now</span>
        </div>
      </div>
      {clippedNote && <p className="text-xs text-ink2">{clippedNote}</p>}
    </SectionCard>
  )
}
