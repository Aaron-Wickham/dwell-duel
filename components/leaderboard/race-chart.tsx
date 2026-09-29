'use client'

import type { CSSProperties } from 'react'
import { ArrowUp, Flag } from 'lucide-react'
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

type Row = { step: number } & Record<string, number>

function formatMoment(iso: string, timeZone?: string): string {
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso))
  return `${formatDay(iso, timeZone)}, ${time}`
}

// Step lines because profit only moves when a bet is placed or settles, as the market charts do.
// The x axis is the moments the totals moved, evenly spaced from the month's first settled bet, so
// a burst of settlements on one day reads as its own steps rather than one jump. A runaway leader
// runs off the top (race-layout.ts) so everyone else stays readable; the readout and its end label
// still give the true total.
export function RaceChart({ series }: { series: RaceSeries[] }) {
  const timeZone = useTimeZone()

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
  const { low, high, clipped } = phone
  const exit = clipped === null ? null : exitStep(values[clipped], high)
  const xPercent = (step: number) => (last === 0 ? 100 : (step / last) * 100)

  const summary = series.map((s) => `${s.name} ${signedDc(s.final)}`).join(', ')
  const clippedNote =
    clipped === null
      ? null
      : series[clipped].final > high
        ? `${series[clipped].name} is off the top at ${signedDc(series[clipped].final)}, so everyone else stays readable.`
        : `${series[clipped].name}’s peak of ${signedDc(Math.max(...values[clipped]))} runs off the top, so everyone else stays readable.`

  return (
    <SectionCard title="The race" titleId="leaderboard-race">
      <p className="text-sm text-ink2">
        Net betting profit for this month’s top {series.length}, move by move since the first bet settled.
      </p>
      <div className="flex flex-col gap-2">
        <div className="relative h-[220px] md:h-[260px]">
          <div
            role="img"
            aria-label={`Net betting profit this month: ${summary}`}
            className="absolute inset-y-0 right-[96px] left-0 cursor-crosshair md:right-[120px]"
          >
            {exit !== null && (
              <>
                <div aria-hidden="true" className="absolute inset-x-0 top-0 border-t-2 border-dashed border-line-s" />
                <ArrowUp
                  aria-hidden="true"
                  data-testid="race-exit"
                  strokeWidth={3}
                  className={cn('absolute top-0 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface', SERIES_TEXT[clipped! % 6])}
                  style={{ left: `${xPercent(exit)}%` }}
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
                      labelFormatter={(step) =>
                        Number(step) === 0
                          ? 'Before the first settlement'
                          : Number(step) === last
                            ? 'Now'
                            : formatMoment(moments[Number(step)], timeZone)
                      }
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
          </div>
          <ul aria-hidden="true" className="absolute inset-y-0 right-0 w-[96px] md:w-[120px]">
            {series.map((s, i) => {
              const phoneTop = phone.labelTops[i]
              const desktopTop = desktop.labelTops[i]
              if (phoneTop === null && desktopTop === null) return null
              const off = s.final > high
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
                  <span className="truncate text-[13px] font-bold">{s.name}</span>
                  <span className="flex items-center gap-0.5 text-base font-extrabold tabular-nums md:text-lg">
                    {off && <ArrowUp data-testid="race-off-top" strokeWidth={3} className="size-3.5 shrink-0" />}
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
