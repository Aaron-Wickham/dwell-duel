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

const series = (name: string, profits: number[]): RaceSeries => ({
  id: name,
  name,
  points: profits.map((profit, i) => ({ day: `2026-09-${String(i + 1).padStart(2, '0')}`, profit })),
  final: profits.at(-1) ?? 0,
})

describe('RaceChart', () => {
  it('describes the standings to assistive tech and labels each line’s end with the name and total', () => {
    render(<RaceChart series={[series('Aaron', [0, 30, 64]), series('Maci', [0, 10, 41]), series('Py', [0, -3, -3])]} />)
    expect(screen.getByRole('img', { name: 'Net betting profit this month: Aaron +64 DC, Maci +41 DC, Py −3 DC' })).toBeInTheDocument()
    expect(screen.getByText('Aaron')).toBeInTheDocument()
    expect(screen.getByText('−3 DC')).toBeInTheDocument()
    expect(screen.getByText('Sep 1')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('pushes labels for lines that end together apart', () => {
    render(<RaceChart series={[series('Ada', [0, 10]), series('Ben', [0, 10]), series('Cy', [0, 10])]} />)
    const tops = ['Ada', 'Ben', 'Cy'].map((name) => Number.parseFloat(screen.getByText(name).closest('li')!.style.top))
    expect(new Set(tops).size).toBe(3)
    expect(Math.min(...tops.slice(1).map((t, i) => t - tops[i]))).toBeGreaterThan(20)
  })

  it('draws nothing without a series', () => {
    const { container } = render(<RaceChart series={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
