// @vitest-environment jsdom
import { act } from 'react'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import userEvent from '@testing-library/user-event'
import { ProbabilityChart, labelsFit, spreadLabels, type ChartOutcome } from '@/components/markets/probability-chart'
import { formatDay } from '@/lib/markets/format-date'
import type { SeriesPoint } from '@/lib/markets/probability-series'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.parse('2026-09-25T12:00:00.000Z')
const WIDTH = 600
const HEIGHT = 300

const yesNo: ChartOutcome[] = [
  { id: 'yes', label: 'Yes', series: 2 },
  { id: 'no', label: 'No', series: 1 },
]

function point(t: number, yes: number, no: number): SeriesPoint {
  return { t, shares: { yes, no } }
}

const threeWay: ChartOutcome[] = [
  { id: 'a', label: 'Sarah', series: 2 },
  { id: 'b', label: 'Eli', series: 3 },
  { id: 'c', label: 'Ruth', series: 4 },
]

const threeSpread: SeriesPoint[] = [
  { t: NOW - 10 * DAY, shares: { a: 0.4, b: 0.3, c: 0.3 } },
  { t: NOW - 2 * HOUR, shares: { a: 0.2, b: 0.6, c: 0.2 } },
]

const endLabel = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-slot="end-label"]')].find((el) => el.textContent?.startsWith(name))!

// Bets on both sides of the last day and the last week, so every range is offered.
const spread = [point(NOW - 10 * DAY, 1, 0), point(NOW - 3 * DAY, 0.5, 0.5), point(NOW - 2 * HOUR, 0.75, 0.25)]

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
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: WIDTH,
    bottom: HEIGHT,
    width: WIDTH,
    height: HEIGHT,
    toJSON: () => ({}),
  } as DOMRect)
})

afterAll(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ProbabilityChart', () => {
  it('names the chart with how its line moved across the range (#391)', () => {
    render(<ProbabilityChart kind="binary" outcomes={yesNo} points={spread} now={NOW} />)
    expect(screen.getByRole('img', { name: 'Yes fell from 100% to 75% this week.' })).toBeInTheDocument()
  })

  it('draws a range from its own series when it has one (#409)', async () => {
    // The week's own series has an intraday move the whole history's buckets dropped.
    const week = [point(NOW - 8 * DAY, 1, 0), point(NOW - 3 * DAY, 0.5, 0.5), point(NOW - 5 * HOUR, 0.6, 0.4), point(NOW - 2 * HOUR, 0.75, 0.25)]
    render(<ProbabilityChart kind="binary" outcomes={yesNo} points={spread} rangeSeries={{ '1W': week, All: spread }} now={NOW} />)
    expect(screen.getByRole('img', { name: 'Yes fell from 100% to 75% this week.' })).toBeInTheDocument()
    expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toContain('60%')
  })

  it('draws one green stepped line for a yes/no market (#391)', () => {
    const { container } = render(<ProbabilityChart kind="binary" outcomes={yesNo} points={spread} now={NOW} />)
    const lines = container.querySelectorAll('.recharts-line-curve')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toHaveAttribute('stroke', 'var(--color-o0)')
    expect(container.querySelector('style')?.textContent).toContain('--color-o0: var(--s2);')
    expect(screen.queryByText('No')).toBeNull()
  })

  it('draws one stepped line per outcome of a multiple-choice market', () => {
    const { container } = render(<ProbabilityChart kind="multiple_choice" outcomes={threeWay} points={threeSpread} now={NOW} />)
    expect(container.querySelectorAll('.recharts-line-curve')).toHaveLength(3)
    const style = container.querySelector('style')?.textContent
    expect(style).toContain('--color-o1: var(--s3);')
    expect(style).toContain('--color-o2: var(--s4);')
  })

  it('greys a resolved multiple-choice market’s losing lines, and says the winner won', () => {
    const { container } = render(
      <ProbabilityChart
        kind="multiple_choice"
        outcomes={threeWay}
        points={threeSpread}
        now={NOW}
        closedAt={new Date(NOW - HOUR).toISOString()}
        resolvedLabel="Eli"
      />,
    )
    const style = container.querySelector('style')?.textContent
    expect(style).toContain('--color-o0: var(--line-s);')
    expect(style).toContain('--color-o1: var(--s3);')
    expect(style).toContain('--color-o2: var(--line-s);')
    expect(endLabel('Eli')).toHaveTextContent(/^Eliwon$/)
    expect(endLabel('Eli')).toHaveClass('text-ink')
    expect(endLabel('Sarah')).toHaveClass('text-ink2')
  })

  it('draws solid gridlines and puts the y ticks inside the plot, clear of the end labels', () => {
    render(<ProbabilityChart kind="binary" outcomes={yesNo} points={spread} now={NOW} />)
    const img = screen.getByRole('img')
    expect(img.querySelectorAll('.border-dashed')).toHaveLength(0)
    expect(within(img).getByText('50%')).toHaveClass('left-0')
  })

  it('lists the plotted points in a table for screen readers', () => {
    render(<ProbabilityChart kind="binary" outcomes={yesNo} points={spread} now={NOW} />)
    const table = screen.getByRole('table', { name: 'Chance at each move, last week' })
    expect(within(table).getByRole('columnheader', { name: 'Yes' })).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: 'Now' })).toBeInTheDocument()
    expect(within(table).getAllByRole('cell').at(-1)).toHaveTextContent('75%')
  })

  it("carries the last value flat to now, so the line ends at the plot's right edge", () => {
    const { container } = render(<ProbabilityChart kind="binary" outcomes={yesNo} points={spread} now={NOW} />)
    const d = container.querySelector('.recharts-line-curve')?.getAttribute('d')
    // The default range is 1W: Yes's carried-in 100% starts at x=0, and its 75% runs flat to the right edge.
    expect(d).toMatch(new RegExp(`^M0,0L.*L${WIDTH},75$`))
  })

  it('labels the end of the line in ink with its name and chance, beside a dot in its colour', () => {
    render(<ProbabilityChart kind="binary" outcomes={yesNo} points={spread} now={NOW} />)
    expect(endLabel('Yes')).toHaveTextContent(/^Yes75%$/)
    expect(endLabel('Yes')).toHaveClass('text-ink')
    expect(endLabel('Yes').querySelector('.bg-s2')).not.toBeNull()
  })

  it('truncates a long outcome name to one line so it cannot overlap its neighbour in the phone gutter', () => {
    const longNames: ChartOutcome[] = [
      { id: 'yes', label: 'A wildly verbose outcome label that would otherwise wrap', series: 2 },
      { id: 'no', label: 'No', series: 1 },
    ]
    render(<ProbabilityChart kind="binary" outcomes={longNames} points={spread} now={NOW} />)
    const label = within(endLabel('A wildly')).getByText('A wildly verbose outcome label that would otherwise wrap')
    expect(label).toHaveClass('truncate')
  })

  it('counts the bets above the chart', () => {
    render(<ProbabilityChart kind="binary" outcomes={yesNo} points={spread} now={NOW} />)
    expect(screen.getByText('3 bets')).toBeInTheDocument()
  })

  it('offers 1D, 1W and All with 1W pressed, and switches range on click', async () => {
    const user = userEvent.setup()
    render(<ProbabilityChart kind="binary" outcomes={yesNo} points={spread} now={NOW} />)
    const group = screen.getByRole('group', { name: 'Time range' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['1D', '1W', 'All'])
    expect(within(group).getByRole('button', { name: '1W' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(group).getByRole('button', { name: '1D' }))
    expect(within(group).getByRole('button', { name: '1D' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: '1W' })).toHaveAttribute('aria-pressed', 'false')

    // Pressing the selected range again keeps it selected rather than leaving no range.
    await user.click(within(group).getByRole('button', { name: '1D' }))
    expect(within(group).getByRole('button', { name: '1D' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows time ticks for a day, date ticks for longer, and ends on Now', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProbabilityChart kind="binary" outcomes={yesNo} points={spread} now={NOW} />)
    const tickRow = () => [...container.querySelectorAll('[data-slot="ticks"] span')].map((s) => s.textContent)
    // The browser render uses the machine's time zone, so these check the label shapes rather than exact times.
    expect(tickRow()).toHaveLength(5)
    expect(tickRow().at(-1)).toBe('Now')
    expect(tickRow()[0]).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)

    await user.click(screen.getByRole('button', { name: '1D' }))
    expect(tickRow().at(-1)).toBe('Now')
    expect(tickRow()[0]).toMatch(/^\d{1,2}(:\d{2})?\s[AP]M$/)
  })

  it('never repeats a tick label when a multi-day span packs ticks less than a day apart', async () => {
    const user = userEvent.setup()
    // A 2-day span: at 5 evenly spaced ticks that's 12h apart, so date-only labels would repeat ("Sep 23, Sep 23, ...").
    const twoDaySpread = [point(NOW - 2 * DAY, 0.4, 0.6), point(NOW - 20 * HOUR, 0.55, 0.45), point(NOW - 2 * HOUR, 0.75, 0.25)]
    const { container } = render(<ProbabilityChart kind="binary" outcomes={yesNo} points={twoDaySpread} now={NOW} />)
    await user.click(screen.getByRole('button', { name: 'All' }))
    const labels = [...container.querySelectorAll('[data-slot="ticks"] span')].map((s) => s.textContent)
    expect(labels).toHaveLength(5)
    expect(labels.at(-1)).toBe('Now')
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('draws to the left edge for a young market instead of crushing it against the right (C1)', () => {
    // Every bet is inside the last day, so only 'All' is offered -- the new 1D gate also needs an older point.
    const recent = [point(NOW - 20 * 60 * 1000, 1, 0), point(NOW - 10 * 60 * 1000, 0.5, 0.5)]
    const { container } = render(<ProbabilityChart kind="binary" outcomes={yesNo} points={recent} now={NOW} />)
    const d = container.querySelector('.recharts-line-curve')?.getAttribute('d')
    expect(d).toMatch(/^M0,/)
    const labels = [...container.querySelectorAll('[data-slot="ticks"] span')].map((s) => s.textContent)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('draws a single bet from minutes ago from the left edge, not padded out to a minimum span', () => {
    const { container } = render(<ProbabilityChart kind="binary" outcomes={yesNo} points={[point(NOW - 2 * 60 * 1000, 1, 0)]} now={NOW} />)
    const d = container.querySelector('.recharts-line-curve')?.getAttribute('d')
    expect(d).toMatch(/^M0,/)
    const labels = [...container.querySelectorAll('[data-slot="ticks"] span')].map((s) => s.textContent)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('spreads bets placed seconds apart across the whole plot, keeping only ticks with distinct labels', () => {
    // Every bet is under a minute old: minute-precision ticks would all read the same time.
    const seconds = [point(NOW - 40 * 1000, 1, 0), point(NOW - 20 * 1000, 0.5, 0.5), point(NOW - 5 * 1000, 0.25, 0.75)]
    const { container } = render(<ProbabilityChart kind="binary" outcomes={yesNo} points={seconds} now={NOW} />)
    const d = container.querySelector('.recharts-line-curve')?.getAttribute('d')
    // The first bet sits at x=0 and the second, 20s into a 40s span, halfway across the 600px plot.
    expect(d).toMatch(/^M0,/)
    expect(d).toMatch(/L300,/)
    const labels = [...container.querySelectorAll('[data-slot="ticks"] span')].map((s) => s.textContent)
    expect(labels.at(-1)).toBe('Now')
    expect(labels.length).toBeGreaterThanOrEqual(2)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('hides the range control when only one range applies', () => {
    render(<ProbabilityChart kind="binary" outcomes={yesNo} points={[point(NOW - 10 * DAY, 1, 0)]} now={NOW} />)
    expect(screen.queryByRole('group', { name: 'Time range' })).not.toBeInTheDocument()
    expect(screen.getByText('1 bet')).toBeInTheDocument()
  })

  it('shows a crosshair tooltip with the time and every chance on hover', async () => {
    const { container } = render(<ProbabilityChart kind="binary" outcomes={yesNo} points={spread} now={NOW} />)
    const wrapper = container.querySelector('.recharts-wrapper') as HTMLElement
    fireEvent.mouseMove(wrapper, { clientX: WIDTH - 1, clientY: 100 })
    const tooltip = container.querySelector('.recharts-tooltip-wrapper') as HTMLElement
    // Recharts applies mouse moves on the next animation frame.
    expect(await within(tooltip).findByText('Now')).toBeInTheDocument()
    expect(within(tooltip).getByText('Yes')).toBeInTheDocument()
    expect(within(tooltip).getByText('75%')).toBeInTheDocument()
    expect(container.querySelector('.recharts-tooltip-cursor')).toBeInTheDocument()
  })

  it('lists the tooltip’s outcomes by chance, highest first', async () => {
    const { container } = render(<ProbabilityChart kind="multiple_choice" outcomes={threeWay} points={threeSpread} now={NOW} />)
    fireEvent.mouseMove(container.querySelector('.recharts-wrapper') as HTMLElement, { clientX: WIDTH - 1, clientY: 100 })
    const tooltip = container.querySelector('.recharts-tooltip-wrapper') as HTMLElement
    await within(tooltip).findByText('Now')
    expect([...tooltip.querySelectorAll('.grow')].map((el) => el.textContent)).toEqual(['Eli', 'Sarah', 'Ruth'])
  })

  it('draws a leader from a line’s end to its label when the label had to move', () => {
    const close: SeriesPoint[] = [{ t: NOW - 2 * HOUR, shares: { a: 0.34, b: 0.33, c: 0.33 } }]
    const { container } = render(<ProbabilityChart kind="multiple_choice" outcomes={threeWay} points={close} now={NOW} />)
    expect(container.querySelectorAll('polyline').length).toBeGreaterThan(0)
  })

  it('shades after the close and labels it with the close day', () => {
    const closedAt = new Date(NOW - 5 * DAY).toISOString()
    const { container } = render(
      <ProbabilityChart kind="binary" outcomes={yesNo} points={[point(NOW - 12 * DAY, 1, 0), point(NOW - 6 * DAY, 0.4, 0.6)]} now={NOW} closedAt={closedAt} />,
    )
    // Computed the same way the component does, so this holds regardless of the machine's time zone.
    expect(screen.getByText(`2 bets · Closed ${formatDay(closedAt)}`)).toBeInTheDocument()
    expect(container.querySelector('.recharts-reference-area')).toBeInTheDocument()
    // A closed market opens on All, where the close sits 86% of the way across and Yes's line stops there at 40%.
    expect(container.querySelector('.recharts-line-curve')?.getAttribute('d')).toMatch(/L51[56](\.\d+)?,180$/)
    expect(screen.queryByRole('group', { name: 'Time range' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: 'Yes fell from 100% to 40% since it opened.' })).toBeInTheDocument()
  })

  it('labels a resolved market’s one line with the winner, whichever side won', () => {
    render(
      <ProbabilityChart kind="binary"
        outcomes={yesNo}
        points={[point(NOW - 12 * DAY, 1, 0), point(NOW - 6 * DAY, 0.4, 0.6)]}
        now={NOW}
        closedAt={new Date(NOW - 5 * DAY).toISOString()}
        resolvedLabel="No"
      />,
    )
    expect(endLabel('No')).toHaveTextContent(/^Nowon$/)
    expect(screen.queryByText(/Resolved:/)).not.toBeInTheDocument()
  })

  it('does not shade a market that has not closed yet', () => {
    const { container } = render(
      <ProbabilityChart kind="binary" outcomes={yesNo} points={spread} now={NOW} closedAt={new Date(NOW + DAY).toISOString()} />,
    )
    expect(container.querySelector('.recharts-reference-area')).not.toBeInTheDocument()
    expect(screen.queryByText(/Closed/)).not.toBeInTheDocument()
  })

  it('says so when there are no bets, with no chart, ranges or summary image', () => {
    const { container } = render(<ProbabilityChart kind="binary" outcomes={yesNo} points={[]} now={NOW} />)
    expect(screen.getByText('No bets were placed on this market.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(container.querySelector('.recharts-wrapper')).not.toBeInTheDocument()
  })

  it('server-renders the summary and labels in UTC, leaving the lines until the browser can measure', () => {
    const html = renderToString(
      <ProbabilityChart kind="binary"
        outcomes={yesNo}
        points={[point(NOW - 12 * DAY, 1, 0), point(NOW - 6 * DAY, 0.4, 0.6)]}
        now={NOW}
        closedAt="2026-09-20T23:30:00.000Z"
      />,
    )
    expect(html).toContain('aria-label="Yes fell from 100% to 40% since it opened."')
    expect(html).toContain('Closed Sep 20')
    expect(html).not.toContain('recharts-line-curve')
  })

  it('hydrates cleanly from its own server-rendered HTML', () => {
    const props = { kind: 'binary' as const, outcomes: yesNo, points: spread, now: NOW }
    const html = renderToString(<ProbabilityChart {...props} />)
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    // React's own `act` (unlike RTL's render) needs this flag set explicitly outside of RTL's wrapper.
    const globalWithAct = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const previousActEnvironment = globalWithAct.IS_REACT_ACT_ENVIRONMENT
    globalWithAct.IS_REACT_ACT_ENVIRONMENT = true
    try {
      act(() => {
        hydrateRoot(container, <ProbabilityChart {...props} />)
      })
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      globalWithAct.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
      consoleError.mockRestore()
      document.body.removeChild(container)
    }
  })

  it('never puts a focusable element inside the summary image', () => {
    render(<ProbabilityChart kind="binary" outcomes={yesNo} points={spread} now={NOW} />)
    const img = screen.getByRole('img')
    expect(img.querySelector('[tabindex="0"]')).toBeNull()
    expect(img.querySelector('button, a, input, [tabindex]:not([tabindex="-1"])')).toBeNull()
  })
})

describe('spreadLabels', () => {
  it('spreads three or more overlapping targets apart by at least the gap, keeping their order', () => {
    const tops = spreadLabels([100, 102, 104, 106], 300, 48)
    const sorted = [...tops].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(48)
    }
    // The inputs were already in ascending order, so the spread-out tops keep that order too.
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i]).toBeGreaterThan(tops[i - 1])
    }
  })

  it('keeps every top within the plot, inset by the label padding', () => {
    const tops = spreadLabels([0, 1, 2, 300, 299], 300, 48)
    for (const top of tops) {
      expect(top).toBeGreaterThanOrEqual(20)
      expect(top).toBeLessThanOrEqual(280)
    }
  })
})

describe('labelsFit', () => {
  // #391: labels sit at least a label's height plus 4px apart, 48px on a phone's 220px plot and
  // 53px on a desktop's 300px one; past that the labels fold to one line.
  it('fits four full labels on a phone and five on a desktop', () => {
    expect(labelsFit(4, 220, 48)).toBe(true)
    expect(labelsFit(5, 220, 48)).toBe(false)
    expect(labelsFit(5, 300, 53)).toBe(true)
    expect(labelsFit(6, 300, 53)).toBe(false)
  })

  it('never lets two folded labels of six overlap on a phone', () => {
    const tops = [...spreadLabels([60, 61, 62, 63, 64, 65], 220, 18)].sort((a, b) => a - b)
    for (let i = 1; i < tops.length; i++) expect(tops[i] - tops[i - 1]).toBeGreaterThanOrEqual(18)
  })
})

describe('ProbabilityChart bet count', () => {
  it('counts bets, not points, so a seeded market’s opening point isn’t called a bet', () => {
    const now = Date.parse('2026-09-28T12:00:00Z')
    render(
      <ProbabilityChart kind="binary"
        outcomes={[
          { id: 'y', label: 'Yes', series: 2 },
          { id: 'n', label: 'No', series: 1 },
        ]}
        points={[{ t: now - 60_000, shares: { y: 0.5, n: 0.5 } }]}
        betCount={0}
        now={now}
        closedAt={null}
        resolvedLabel={null}
      />,
    )
    expect(screen.getByText('0 bets')).toBeInTheDocument()
  })
})
