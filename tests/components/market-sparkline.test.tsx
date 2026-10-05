// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { MarketSparkline } from '@/components/markets/market-sparkline'
import type { ChartOutcome } from '@/components/markets/probability-chart'
import type { SeriesPoint } from '@/lib/markets/probability-series'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.parse('2026-09-25T12:00:00.000Z')

const yesNo: ChartOutcome[] = [
  { id: 'yes', label: 'Yes', series: 2 },
  { id: 'no', label: 'No', series: 1 },
]
const three: ChartOutcome[] = [
  { id: 'a', label: 'Sarah', series: 2 },
  { id: 'b', label: 'Eli', series: 3 },
  { id: 'c', label: 'Ruth', series: 4 },
]

function point(t: number, yes: number, no: number): SeriesPoint {
  return { t, shares: { yes, no } }
}

function threeWay(t: number, a: number, b: number): SeriesPoint {
  return { t, shares: { a, b, c: 1 - a - b } }
}

const spread = [point(NOW - 10 * DAY, 1, 0), point(NOW - 3 * DAY, 0.5, 0.5), point(NOW - 2 * HOUR, 0.75, 0.25)]
const beforeClose = [point(NOW - 10 * DAY, 1, 0), point(NOW - 7 * DAY, 0.5, 0.5)]
const OPEN_CLOSE = '2026-10-04T16:30:00.000Z'

describe('MarketSparkline', () => {
  it('describes how the line moved across its range', () => {
    render(<MarketSparkline kind="binary" outcomes={yesNo} points={spread} now={NOW} closedAt={OPEN_CLOSE} />)
    expect(screen.getByRole('img', { name: 'Yes fell from 100% to 75% this week.' })).toBeInTheDocument()
  })

  it('draws one green step line for a yes/no market, with no axes, ranges or labels (#391)', () => {
    const { container } = render(<MarketSparkline kind="binary" outcomes={yesNo} points={spread} now={NOW} closedAt={OPEN_CLOSE} />)
    const paths = container.querySelectorAll('path')
    expect(paths).toHaveLength(1)
    expect(paths[0]).toHaveClass('stroke-s2')
    expect(paths[0]).toHaveAttribute('vector-effect', 'non-scaling-stroke')
    // An open market with a week of history opens on the last week, as the full chart does.
    expect(paths[0].getAttribute('d')).toMatch(/^M0 0H/)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(container.textContent).toBe('')
    expect(container.querySelector('[data-slot="closed-zone"]')).not.toBeInTheDocument()
  })

  it('draws only Over for an over/under', () => {
    const overUnder: ChartOutcome[] = [
      { id: 'yes', label: 'Over 2.5', series: 2 },
      { id: 'no', label: 'Under 2.5', series: 1 },
    ]
    const { container } = render(<MarketSparkline kind="over_under" outcomes={overUnder} points={spread} now={NOW} closedAt={OPEN_CLOSE} />)
    expect(container.querySelectorAll('path')).toHaveLength(1)
  })

  it('draws a line per outcome of a multiple-choice market', () => {
    const points = [threeWay(NOW - 2 * DAY, 0.4, 0.3), threeWay(NOW - DAY, 0.44, 0.31)]
    const { container } = render(<MarketSparkline kind="multiple_choice" outcomes={three} points={points} now={NOW} closedAt={OPEN_CLOSE} />)
    expect([...container.querySelectorAll('path')].map((p) => p.getAttribute('class'))).toEqual(['stroke-s2', 'stroke-s3', 'stroke-s4'])
  })

  it('greys the losing lines of a resolved multiple-choice market, drawing the winner on top', () => {
    const points = [threeWay(NOW - 10 * DAY, 0.4, 0.3), threeWay(NOW - 7 * DAY, 0.2, 0.7)]
    const { container } = render(
      <MarketSparkline kind="multiple_choice" outcomes={three} points={points} now={NOW} closedAt="2026-09-20T12:00:00.000Z" resolvedLabel="Eli" />,
    )
    expect([...container.querySelectorAll('path')].map((p) => p.getAttribute('class'))).toEqual(['stroke-line-s', 'stroke-line-s', 'stroke-s3'])
  })

  it('keeps a yes/no market’s one line in colour whichever side won', () => {
    const { container } = render(
      <MarketSparkline kind="binary" outcomes={yesNo} points={beforeClose} now={NOW} closedAt="2026-09-20T12:00:00.000Z" resolvedLabel="No" />,
    )
    expect(container.querySelector('path')).toHaveClass('stroke-s2')
  })

  it('puts an end dot on the line at its latest chance', () => {
    const { container } = render(<MarketSparkline kind="binary" outcomes={yesNo} points={spread} now={NOW} closedAt={OPEN_CLOSE} />)
    const dots = container.querySelectorAll('span.rounded-full')
    expect(dots).toHaveLength(1)
    expect(dots[0]).toHaveClass('bg-s2')
    expect((dots[0] as HTMLElement).style.top).toBe('25%')
    expect((dots[0] as HTMLElement).style.left).toBe('100%')
  })

  it('draws its middle gridline solid', () => {
    const { container } = render(<MarketSparkline kind="binary" outcomes={yesNo} points={spread} now={NOW} closedAt={OPEN_CLOSE} />)
    const grid = container.querySelector('.top-1\\/2')
    expect(grid).toHaveClass('border-t', 'border-line')
    expect(grid).not.toHaveClass('border-dashed')
  })

  it('shades a closed market’s zone, with no words in it', () => {
    const { container } = render(
      <MarketSparkline kind="binary" outcomes={yesNo} points={beforeClose} now={NOW} closedAt="2026-09-20T12:00:00.000Z" />,
    )
    const zone = container.querySelector('[data-slot="closed-zone"]') as HTMLElement
    expect(zone).toHaveClass('bg-sunk')
    // The zone takes 14% of the plot, as on the full chart.
    expect(parseFloat(zone.style.left)).toBeCloseTo(86)
    expect(container.querySelector('line')).toHaveAttribute('stroke-dasharray', '6 4')
    expect(container.textContent).toBe('')
  })

  it('server-renders its line, needing no browser measurement', () => {
    const html = renderToString(<MarketSparkline kind="binary" outcomes={yesNo} points={spread} now={NOW} closedAt={OPEN_CLOSE} />)
    expect(html.match(/<path /g)).toHaveLength(1)
    expect(html).toContain('aria-label="Yes fell from 100% to 75% this week."')
  })

  it('draws a seeded market nobody has bet on as a flat even line from its opening', () => {
    const { container } = render(
      <MarketSparkline kind="binary" outcomes={yesNo} points={[point(NOW - 3 * DAY, 0.5, 0.5)]} now={NOW} closedAt={OPEN_CLOSE} />,
    )
    const paths = [...container.querySelectorAll('path')].map((p) => p.getAttribute('d'))
    // An open market with days of history opens on the last week, so the line starts where the market opened.
    expect(paths).toEqual(['M57.14 50H100V50'])
    expect(screen.getByRole('img', { name: 'Yes held at 50% this week.' })).toBeInTheDocument()
  })

  it('says so when there is nothing to draw', () => {
    render(<MarketSparkline kind="binary" outcomes={yesNo} points={[]} now={NOW} closedAt={OPEN_CLOSE} />)
    expect(screen.getByText('No bets were placed on this market.')).toBeInTheDocument()
  })
})
