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

function point(t: number, yes: number, no: number): SeriesPoint {
  return { t, shares: { yes, no } }
}

const spread = [point(NOW - 10 * DAY, 1, 0), point(NOW - 3 * DAY, 0.5, 0.5), point(NOW - 2 * HOUR, 0.75, 0.25)]
const beforeClose = [point(NOW - 10 * DAY, 1, 0), point(NOW - 7 * DAY, 0.5, 0.5)]
const OPEN_CLOSE = '2026-10-04T16:30:00.000Z'

describe('MarketSparkline', () => {
  it('names the chart with a text summary of the current chances', () => {
    render(<MarketSparkline outcomes={yesNo} points={spread} now={NOW} closedAt={OPEN_CLOSE} />)
    expect(screen.getByRole('img', { name: 'Chance over time. Now: Yes 75%, No 25%.' })).toBeInTheDocument()
  })

  it('draws one step line per outcome in its series colour, with no axes, ranges or end labels', () => {
    const { container } = render(<MarketSparkline outcomes={yesNo} points={spread} now={NOW} closedAt={OPEN_CLOSE} />)
    const paths = container.querySelectorAll('path')
    expect(paths).toHaveLength(2)
    expect(paths[0]).toHaveClass('stroke-s2')
    expect(paths[1]).toHaveClass('stroke-s1')
    expect(paths[0]).toHaveAttribute('vector-effect', 'non-scaling-stroke')
    // An open market with a week of history opens on the last week, as the full chart does.
    expect(paths[0].getAttribute('d')).toMatch(/^M0 0H/)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.queryByText('75%')).not.toBeInTheDocument()
    expect(screen.queryByText('Now')).not.toBeInTheDocument()
    expect(container.querySelector('[data-slot="closed-zone"]')).not.toBeInTheDocument()
  })

  it('puts an end dot on each line at its latest chance', () => {
    const { container } = render(<MarketSparkline outcomes={yesNo} points={spread} now={NOW} closedAt={OPEN_CLOSE} />)
    const dots = container.querySelectorAll('span.rounded-full')
    expect(dots).toHaveLength(2)
    expect(dots[0]).toHaveClass('bg-s2', 'ring-s2/22')
    expect((dots[0] as HTMLElement).style.top).toBe('25%')
    expect((dots[0] as HTMLElement).style.left).toBe('100%')
  })

  it('shades a closed market\'s zone and labels it with the close day', () => {
    const { container } = render(
      <MarketSparkline outcomes={yesNo} points={beforeClose} now={NOW} closedAt="2026-09-20T12:00:00.000Z" />,
    )
    const zone = container.querySelector('[data-slot="closed-zone"]') as HTMLElement
    expect(zone).toHaveClass('bg-sunk')
    // The zone takes 14% of the plot, as on the full chart.
    expect(parseFloat(zone.style.left)).toBeCloseTo(86)
    expect(container.querySelector('line')).toHaveAttribute('stroke-dasharray', '6 4')
    expect(container.textContent).toContain('Closed Sep 20')
  })

  it('names the winner in a resolved market\'s zone', () => {
    const { container } = render(
      <MarketSparkline outcomes={yesNo} points={beforeClose} now={NOW} closedAt="2026-09-20T12:00:00.000Z" resolvedLabel="Yes" />,
    )
    expect(container.textContent).toContain('Resolved: Yes')
  })

  it('server-renders its lines, needing no browser measurement', () => {
    const html = renderToString(<MarketSparkline outcomes={yesNo} points={spread} now={NOW} closedAt={OPEN_CLOSE} />)
    expect(html.match(/<path /g)).toHaveLength(2)
    expect(html).toContain('aria-label="Chance over time. Now: Yes 75%, No 25%."')
  })

  it('draws a seeded market nobody has bet on as a flat even line from its opening', () => {
    const { container } = render(
      <MarketSparkline outcomes={yesNo} points={[point(NOW - 3 * DAY, 0.5, 0.5)]} now={NOW} closedAt={OPEN_CLOSE} />,
    )
    const paths = [...container.querySelectorAll('path')].map((p) => p.getAttribute('d'))
    // An open market with days of history opens on the last week, so the line starts where the market opened.
    expect(paths).toEqual(['M57.14 50H100V50', 'M57.14 50H100V50'])
    expect(screen.getByRole('img', { name: 'Chance over time. Now: Yes 50%, No 50%.' })).toBeInTheDocument()
  })

  it('says so when there is nothing to draw', () => {
    render(<MarketSparkline outcomes={yesNo} points={[]} now={NOW} closedAt={OPEN_CLOSE} />)
    expect(screen.getByText('No bets were placed on this market.')).toBeInTheDocument()
  })
})
