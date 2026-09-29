'use client'

import { Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { spreadLabels } from '@/components/markets/probability-chart'
import { SectionCard } from '@/components/ui/section-card'
import type { RaceSeries } from '@/lib/social/leaderboard-extras'
import { signedDc } from '@/lib/social/season'

const HEIGHT = 220
// The line's room above and below, so a peak isn't clipped and the end labels have somewhere to sit.
const PAD = 12
const LABEL_GAP = 34
const SERIES_TEXT = ['text-s1', 'text-s2', 'text-s3', 'text-s4', 'text-s5', 'text-s6'] as const

function dayLabel(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date, 12)).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// Step lines because profit only moves when a bet settles, as the market charts do. Each member's
// name and total sit at the end of their line, pushed apart so they never overlap.
export function RaceChart({ series }: { series: RaceSeries[] }) {
  const days = series[0]?.points.map((p) => p.day) ?? []
  if (series.length === 0 || days.length === 0) return null

  const keys = series.map((_, i) => `m${i}`)
  const config: ChartConfig = Object.fromEntries(series.map((s, i) => [keys[i], { label: s.name, color: `var(--s${(i % 6) + 1})` }]))
  const rows = days.map((day, d) => ({ day, ...Object.fromEntries(series.map((s, i) => [keys[i], s.points[d].profit])) }))

  const values = series.flatMap((s) => s.points.map((p) => p.profit))
  const low = Math.min(0, ...values)
  const high = Math.max(0, ...values)
  const span = high - low || 1
  const yOf = (v: number) => PAD + ((high - v) / span) * (HEIGHT - PAD * 2)
  const tops = spreadLabels(series.map((s) => yOf(s.final)), HEIGHT, LABEL_GAP)

  const summary = series.map((s) => `${s.name} ${signedDc(s.final)}`).join(', ')

  return (
    <SectionCard title="The race" titleId="leaderboard-race" className="max-w-[820px]">
      <p className="text-sm text-ink2">Net betting profit, day by day, for this month’s top {series.length}.</p>
      <div role="img" aria-label={`Net betting profit this month: ${summary}`} className="relative" style={{ height: HEIGHT }}>
        <div className="absolute inset-y-0 right-[104px] left-0 md:right-[150px]">
          <ChartContainer config={config} className="h-full w-full" initialDimension={{ width: 240, height: HEIGHT }}>
            <LineChart data={rows} margin={{ top: PAD, right: 0, bottom: PAD, left: 0 }}>
              <XAxis dataKey="day" hide />
              <YAxis hide domain={[low, high]} />
              <ReferenceLine y={0} stroke="var(--line-s)" strokeDasharray="4 4" />
              {series.map((_, i) => (
                <Line
                  key={keys[i]}
                  dataKey={keys[i]}
                  type="stepAfter"
                  stroke={`var(--color-${keys[i]})`}
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
        </div>
        <ul aria-hidden="true" className="absolute inset-y-0 right-0 w-[100px] md:w-[146px]">
          {series.map((s, i) => (
            <li
              key={s.id}
              className={`absolute left-2 flex w-full -translate-y-1/2 flex-col leading-tight ${SERIES_TEXT[i % 6]}`}
              style={{ top: tops[i] }}
            >
              <span className="truncate text-[13px] font-extrabold">{s.name}</span>
              <span className="text-xs font-bold tabular-nums">{signedDc(s.final)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div aria-hidden="true" className="flex justify-between pr-[104px] text-xs text-ink2 md:pr-[150px]">
        <span>{dayLabel(days[0])}</span>
        <span>Today</span>
      </div>
    </SectionCard>
  )
}
