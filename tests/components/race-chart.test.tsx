// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RaceChart } from '@/components/leaderboard/race-chart'
import type { RaceSeries } from '@/lib/social/leaderboard-extras'

// Recharts renders nothing until ResponsiveContainer measures a positive size, and jsdom has no layout.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

// Midday Eastern on Sep 3, then an hour apart.
const series = (name: string, profits: number[]): RaceSeries => ({
  id: name,
  name,
  points: profits.map((profit, i) => ({ at: new Date(Date.UTC(2026, 8, 3, 16 + i)).toISOString(), profit })),
  final: profits.at(-1) ?? 0,
})

const labelTop = (name: string) => Number.parseFloat(screen.getByText(name).closest('li')!.style.getPropertyValue('--label-top'))

describe('RaceChart', () => {
  it('describes the standings to assistive tech and labels each line’s end with the name and total', () => {
    render(<RaceChart series={[series('Aaron', [0, 30, 64]), series('Maci', [0, 10, 41]), series('Py', [0, -3, -3])]} />)
    expect(screen.getByRole('img', { name: 'Net betting profit this month: Aaron +64 DC, Maci +41 DC, Py −3 DC' })).toBeInTheDocument()
    expect(screen.getByText('Aaron')).toBeInTheDocument()
    expect(screen.getByText('−3 DC')).toBeInTheDocument()
  })

  it('starts the axis at the first settled bet, not the 1st of the month', () => {
    render(<RaceChart series={[series('Ada', [0, 10]), series('Ben', [0, 5])]} />)
    expect(screen.getByText('Sep 3')).toBeInTheDocument()
    expect(screen.getByText('Now')).toBeInTheDocument()
    expect(screen.queryByText('Sep 1')).toBeNull()
  })

  it('pushes labels for lines that end together apart', () => {
    render(<RaceChart series={['Ada', 'Ben', 'Cy', 'Di', 'Eve'].map((n) => series(n, [0, 10]))} />)
    const tops = ['Ada', 'Ben', 'Cy', 'Di', 'Eve'].map(labelTop).sort((a, b) => a - b)
    expect(new Set(tops).size).toBe(5)
    expect(Math.min(...tops.slice(1).map((t, i) => t - tops[i]))).toBeGreaterThanOrEqual(39.9)
  })

  it('runs a runaway leader off the top, still labelled with the true total, and says so', () => {
    render(
      <RaceChart
        series={[series('Aaron', [0, 20, 868]), series('Maci', [0, 40, 40]), series('Py', [0, 10, 30]), series('Jo', [0, -10, -20])]}
      />,
    )
    expect(screen.getByText('+868 DC')).toBeInTheDocument()
    expect(screen.getByTestId('race-off-top')).toBeInTheDocument()
    expect(screen.getByTestId('race-exit')).toBeInTheDocument()
    expect(screen.getByText('Aaron is off the top at +868 DC, so everyone else stays readable.')).toBeInTheDocument()
    expect(labelTop('Aaron')).toBeLessThan(labelTop('Maci'))
  })

  it('draws no clipping cue when nobody runs away', () => {
    render(<RaceChart series={[series('Ada', [0, 30]), series('Ben', [0, 20])]} />)
    expect(screen.queryByTestId('race-exit')).toBeNull()
    expect(screen.queryByText(/off the top/)).toBeNull()
  })

  it('draws a lone point as a flat line', () => {
    render(<RaceChart series={[series('Ada', [12])]} />)
    expect(screen.getByRole('img', { name: 'Net betting profit this month: Ada +12 DC' })).toBeInTheDocument()
  })

  it('says the race hasn’t started until a bet settles', () => {
    render(<RaceChart series={[]} />)
    expect(screen.getByRole('heading', { name: 'The race' })).toBeInTheDocument()
    expect(screen.getByText('The race starts once bets settle.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
