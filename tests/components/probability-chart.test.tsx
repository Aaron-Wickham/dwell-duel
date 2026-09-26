// @vitest-environment jsdom
import { act } from 'react'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import userEvent from '@testing-library/user-event'
import { ProbabilityChart, spreadLabels, type ChartOutcome } from '@/components/markets/probability-chart'
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
  it('names the chart with a text summary of the current chances', () => {
    render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
    expect(screen.getByRole('img', { name: 'Chance over time. Now: Yes 75%, No 25%.' })).toBeInTheDocument()
  })

  it('draws one stepped line per outcome', () => {
    const { container } = render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
    const lines = container.querySelectorAll('.recharts-line-curve')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveAttribute('stroke', 'var(--color-o0)')
    expect(lines[1]).toHaveAttribute('stroke', 'var(--color-o1)')
    expect(container.querySelector('style')?.textContent).toContain('--color-o0: var(--s2);')
  })

  it("carries the last value flat to now, so the line ends at the plot's right edge", () => {
    const { container } = render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
    const d = container.querySelector('.recharts-line-curve')?.getAttribute('d')
    // The default range is 1W: Yes's carried-in 100% starts at x=0, and its 75% runs flat to the right edge.
    expect(d).toMatch(new RegExp(`^M0,0L.*L${WIDTH},75$`))
  })

  it('labels the end of each line with its name and chance', () => {
    render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
    expect(screen.getByText('Yes').parentElement).toHaveTextContent(/^Yes75%$/)
    expect(screen.getByText('No').parentElement).toHaveTextContent(/^No25%$/)
  })

  it('counts the bets above the chart', () => {
    render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
    expect(screen.getByText('3 bets')).toBeInTheDocument()
  })

  it('offers 1D, 1W and All with 1W pressed, and switches range on click', async () => {
    const user = userEvent.setup()
    render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
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
    const { container } = render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
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
    const { container } = render(<ProbabilityChart outcomes={yesNo} points={twoDaySpread} now={NOW} />)
    await user.click(screen.getByRole('button', { name: 'All' }))
    const labels = [...container.querySelectorAll('[data-slot="ticks"] span')].map((s) => s.textContent)
    expect(labels).toHaveLength(5)
    expect(labels.at(-1)).toBe('Now')
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('hides the range control when only one range applies', () => {
    render(<ProbabilityChart outcomes={yesNo} points={[point(NOW - 10 * DAY, 1, 0)]} now={NOW} />)
    expect(screen.queryByRole('group', { name: 'Time range' })).not.toBeInTheDocument()
    expect(screen.getByText('1 bet')).toBeInTheDocument()
  })

  it('shows a crosshair tooltip with the time and every chance on hover', async () => {
    const { container } = render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
    const wrapper = container.querySelector('.recharts-wrapper') as HTMLElement
    fireEvent.mouseMove(wrapper, { clientX: WIDTH - 1, clientY: 100 })
    const tooltip = container.querySelector('.recharts-tooltip-wrapper') as HTMLElement
    // Recharts applies mouse moves on the next animation frame.
    expect(await within(tooltip).findByText('Now')).toBeInTheDocument()
    expect(within(tooltip).getByText('Yes')).toBeInTheDocument()
    expect(within(tooltip).getByText('75%')).toBeInTheDocument()
    expect(within(tooltip).getByText('25%')).toBeInTheDocument()
    expect(container.querySelector('.recharts-tooltip-cursor')).toBeInTheDocument()
  })

  it('shades after the close and labels it with the close day', () => {
    const closedAt = new Date(NOW - 5 * DAY).toISOString()
    const { container } = render(
      <ProbabilityChart outcomes={yesNo} points={[point(NOW - 12 * DAY, 1, 0), point(NOW - 6 * DAY, 0.4, 0.6)]} now={NOW} closedAt={closedAt} />,
    )
    // Computed the same way the component does, so this holds regardless of the machine's time zone.
    expect(screen.getByText(`Closed ${formatDay(closedAt)}`)).toBeInTheDocument()
    expect(container.querySelector('.recharts-reference-area')).toBeInTheDocument()
    // A closed market opens on All, where the close sits 86% of the way across and Yes's line stops there at 40%.
    expect(container.querySelector('.recharts-line-curve')?.getAttribute('d')).toMatch(/L51[56](\.\d+)?,180$/)
    expect(screen.queryByRole('group', { name: 'Time range' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: 'Chance over time. Now: Yes 40%, No 60%.' })).toBeInTheDocument()
  })

  it('labels a resolved market with its winning outcome', () => {
    render(
      <ProbabilityChart
        outcomes={yesNo}
        points={[point(NOW - 12 * DAY, 1, 0), point(NOW - 6 * DAY, 0.4, 0.6)]}
        now={NOW}
        closedAt={new Date(NOW - 5 * DAY).toISOString()}
        resolvedLabel="Yes"
      />,
    )
    expect(screen.getByText('Resolved: Yes')).toBeInTheDocument()
    expect(screen.queryByText(/^Closed/)).not.toBeInTheDocument()
  })

  it('does not shade a market that has not closed yet', () => {
    const { container } = render(
      <ProbabilityChart outcomes={yesNo} points={spread} now={NOW} closedAt={new Date(NOW + DAY).toISOString()} />,
    )
    expect(container.querySelector('.recharts-reference-area')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Closed/)).not.toBeInTheDocument()
  })

  it('says so when there are no bets, with no chart, ranges or summary image', () => {
    const { container } = render(<ProbabilityChart outcomes={yesNo} points={[]} now={NOW} />)
    expect(screen.getByText('No bets yet — the chart starts with the first bet.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(container.querySelector('.recharts-wrapper')).not.toBeInTheDocument()
  })

  it('draws the compact card chart with no axes, ranges, tooltip or end labels', () => {
    const { container } = render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} compact />)
    expect(screen.getByRole('img', { name: 'Chance over time. Now: Yes 75%, No 25%.' })).toBeInTheDocument()
    expect(container.querySelectorAll('.recharts-line-curve')).toHaveLength(2)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.queryByText('75%')).not.toBeInTheDocument()
    expect(screen.queryByText('Now')).not.toBeInTheDocument()
    expect(screen.queryByText('3 bets')).not.toBeInTheDocument()

    fireEvent.mouseMove(container.querySelector('.recharts-wrapper') as HTMLElement, { clientX: WIDTH - 1, clientY: 40 })
    expect(container.querySelector('.recharts-tooltip-wrapper')).not.toBeInTheDocument()
  })

  it('server-renders the summary and labels in UTC, leaving the lines until the browser can measure', () => {
    const html = renderToString(
      <ProbabilityChart
        outcomes={yesNo}
        points={[point(NOW - 12 * DAY, 1, 0), point(NOW - 6 * DAY, 0.4, 0.6)]}
        now={NOW}
        closedAt="2026-09-20T23:30:00.000Z"
      />,
    )
    expect(html).toContain('aria-label="Chance over time. Now: Yes 40%, No 60%."')
    expect(html).toContain('Closed Sep 20')
    expect(html).not.toContain('recharts-line-curve')
  })

  it('hydrates cleanly from its own server-rendered HTML', () => {
    const props = { outcomes: yesNo, points: spread, now: NOW }
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
    render(<ProbabilityChart outcomes={yesNo} points={spread} now={NOW} />)
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
