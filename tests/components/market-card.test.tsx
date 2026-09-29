// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarketCard } from '@/components/markets/market-card'

vi.mock('@/components/markets/market-sparkline', () => ({
  MarketSparkline: (props: {
    outcomes: { label: string }[]
    points: unknown[]
    now: number
    closedAt: string
    resolvedLabel?: string | null
  }) => (
    <div
      data-testid="chart"
      data-now={props.now}
      data-points={props.points.length}
      data-closed-at={props.closedAt}
      data-resolved-label={props.resolvedLabel ?? ''}
    >
      {props.outcomes.map((o) => o.label).join(',')}
    </div>
  ),
}))

describe('MarketCard', () => {
  it('shows an open market\'s status, meta line, title link and outcome percentages', () => {
    const { container } = render(
      <MarketCard
        id="m1"
        title="Who wins the chili cook-off?"
        status="open"
        kind="multiple_choice"
        closeAt="2026-10-04T16:30:00.000Z"
        resolvedAt={null}
        outcomes={[
          { id: 'a', label: 'Tom', pct: 60 },
          { id: 'b', label: 'Sarah', pct: 40 },
        ]}
        resolvedOutcomeLabel={null}
      />,
    )
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(container.textContent).toContain('Closes')
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-10-04T16:30:00.000Z')
    expect(screen.getByRole('link', { name: 'Who wins the chili cook-off?' })).toHaveAttribute('href', '/markets/m1')
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.queryByText('No bets were placed.')).not.toBeInTheDocument()
  })

  it('gives the title link a 44px tap target', () => {
    render(
      <MarketCard
        id="m1"
        title="Who wins the chili cook-off?"
        status="open"
        kind="multiple_choice"
        closeAt="2026-10-04T16:30:00.000Z"
        resolvedAt={null}
        outcomes={[
          { id: 'a', label: 'Tom', pct: 60 },
          { id: 'b', label: 'Sarah', pct: 40 },
        ]}
        resolvedOutcomeLabel={null}
      />,
    )
    expect(screen.getByRole('link', { name: 'Who wins the chili cook-off?' })).toHaveClass('hit-area')
  })

  it('shows outcome pills and says no bets were placed on a market closed before seeding', () => {
    render(
      <MarketCard
        id="m2"
        title="Who brings the best dessert?"
        status="voided"
        kind="multiple_choice"
        closeAt="2026-09-30T12:00:00.000Z"
        resolvedAt={null}
        outcomes={[
          { id: 'a', label: 'Grace', pct: null },
          { id: 'b', label: 'Josh', pct: null },
        ]}
        resolvedOutcomeLabel={null}
      />,
    )
    expect(screen.getByText('Voided')).toBeInTheDocument()
    expect(screen.getByText('Grace')).toBeInTheDocument()
    expect(screen.getByText('Josh')).toBeInTheDocument()
    expect(screen.getByText('No bets were placed.')).toBeInTheDocument()
  })

  it('shows the resolved winner line when the market has a winning outcome', () => {
    const { container } = render(
      <MarketCard
        id="m3"
        title="Did it rain on the picnic?"
        status="resolved"
        kind="binary"
        closeAt="2026-09-21T09:00:00.000Z"
        resolvedAt="2026-09-21T09:05:00.000Z"
        outcomes={[
          { id: 'a', label: 'Yes', pct: 70 },
          { id: 'b', label: 'No', pct: 30 },
        ]}
        resolvedOutcomeLabel="Yes"
      />,
    )
    // The chip and the meta line ("Resolved <time>") both read "Resolved" as their own text.
    expect(screen.getAllByText('Resolved')).toHaveLength(2)
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-09-21T09:05:00.000Z')
    expect(screen.getByText('Winning outcome: Yes')).toBeInTheDocument()
  })

  it('draws a colour dot before each outcome, coloured by its series, and hides it from screen readers', () => {
    const { container } = render(
      <MarketCard
        id="m4"
        title="Did it rain on the picnic?"
        status="open"
        kind="binary"
        closeAt="2026-09-21T09:00:00.000Z"
        resolvedAt={null}
        outcomes={[
          { id: 'a', label: 'Yes', pct: 70 },
          { id: 'b', label: 'No', pct: 30 },
        ]}
        resolvedOutcomeLabel={null}
      />,
    )
    const dots = container.querySelectorAll('li span[aria-hidden="true"].size-2\\.5')
    expect(dots).toHaveLength(2)
    // Binary markets always colour Yes as series 2 and No as series 1, regardless of row order.
    expect(dots[0]).toHaveClass('bg-s2')
    expect(dots[1]).toHaveClass('bg-s1')
  })

  it('renders a sparkline above the outcome list when bets exist and chart data is given', () => {
    const { container } = render(
      <MarketCard
        id="m5"
        title="Will the charts render?"
        status="open"
        kind="binary"
        closeAt="2026-10-04T16:30:00.000Z"
        resolvedAt={null}
        outcomes={[
          { id: 'a', label: 'Yes', pct: 70 },
          { id: 'b', label: 'No', pct: 30 },
        ]}
        resolvedOutcomeLabel={null}
        chart={{
          outcomes: [
            { id: 'a', label: 'Yes', series: 2 as const },
            { id: 'b', label: 'No', series: 1 as const },
          ],
          points: [{ t: 1000, shares: { a: 0.7, b: 0.3 } }],
          now: 2000,
        }}
      />,
    )
    const chart = screen.getByTestId('chart')
    expect(chart).toHaveAttribute('data-now', '2000')
    expect(chart).toHaveAttribute('data-points', '1')
    expect(chart).toHaveAttribute('data-closed-at', '2026-10-04T16:30:00.000Z')
    expect(chart).toHaveAttribute('data-resolved-label', '')
    expect(chart).toHaveTextContent('Yes,No')
    // The chart sits before the percentage list, matching MarketCard.html.
    const article = container.querySelector('article')!
    const chartIndex = Array.from(article.children).findIndex((el) => el.contains(chart))
    const listIndex = Array.from(article.children).findIndex((el) => el.tagName === 'UL')
    expect(chartIndex).toBeLessThan(listIndex)
  })

  it('passes the close time and winning outcome to a resolved market\'s sparkline', () => {
    render(
      <MarketCard
        id="m7"
        title="Did it rain on the picnic?"
        status="resolved"
        kind="binary"
        closeAt="2026-09-21T09:00:00.000Z"
        resolvedAt="2026-09-21T09:05:00.000Z"
        outcomes={[
          { id: 'a', label: 'Yes', pct: 70 },
          { id: 'b', label: 'No', pct: 30 },
        ]}
        resolvedOutcomeLabel="Yes"
        chart={{
          outcomes: [
            { id: 'a', label: 'Yes', series: 2 as const },
            { id: 'b', label: 'No', series: 1 as const },
          ],
          points: [{ t: 1000, shares: { a: 0.7, b: 0.3 } }],
          now: 2000,
        }}
      />,
    )
    const chart = screen.getByTestId('chart')
    expect(chart).toHaveAttribute('data-closed-at', '2026-09-21T09:00:00.000Z')
    expect(chart).toHaveAttribute('data-resolved-label', 'Yes')
  })

  it('shows the resolution time, not the close time, on a sparkline for a market resolved before it closed', () => {
    render(
      <MarketCard
        id="m8"
        title="Did the rain stop early?"
        status="resolved"
        kind="binary"
        closeAt="2026-10-04T12:00:00.000Z"
        resolvedAt="2026-10-01T09:00:00.000Z"
        outcomes={[
          { id: 'a', label: 'Yes', pct: 70 },
          { id: 'b', label: 'No', pct: 30 },
        ]}
        resolvedOutcomeLabel="Yes"
        chart={{
          outcomes: [
            { id: 'a', label: 'Yes', series: 2 as const },
            { id: 'b', label: 'No', series: 1 as const },
          ],
          points: [{ t: 1000, shares: { a: 0.7, b: 0.3 } }],
          now: 2000,
        }}
      />,
    )
    const chart = screen.getByTestId('chart')
    expect(chart).toHaveAttribute('data-closed-at', '2026-10-01T09:00:00.000Z')
    expect(chart).toHaveAttribute('data-resolved-label', 'Yes')
  })

  it('omits the chart when there is no chart data, even with bets', () => {
    render(
      <MarketCard
        id="m6"
        title="Will the charts render?"
        status="open"
        kind="binary"
        closeAt="2026-10-04T16:30:00.000Z"
        resolvedAt={null}
        outcomes={[
          { id: 'a', label: 'Yes', pct: 70 },
          { id: 'b', label: 'No', pct: 30 },
        ]}
        resolvedOutcomeLabel={null}
      />,
    )
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
  })

  it('becomes a focus target named from its title alone when given a DOM id', () => {
    render(
      <MarketCard
        id="m7"
        title="Will the choir sing?"
        status="resolved"
        kind="binary"
        closeAt="2026-10-04T16:30:00.000Z"
        resolvedAt="2026-10-05T16:30:00.000Z"
        outcomes={[
          { id: 'a', label: 'Yes', pct: 70 },
          { id: 'b', label: 'No', pct: 30 },
        ]}
        resolvedOutcomeLabel="Yes"
        domId="market-closed-m7"
      />,
    )
    // An exact match: a self-label (the old, wrong behaviour) would also pick up the odds list
    // and the winning-outcome line, so this fails if the card is ever named from its full content.
    const card = screen.getByRole('article', { name: 'Will the choir sing?' })
    expect(card).toHaveAttribute('id', 'market-closed-m7')
    expect(card).toHaveAttribute('tabindex', '-1')
    expect(card).toHaveAttribute('aria-labelledby', 'market-closed-m7-title')
    expect(screen.getByText('Will the choir sing?').closest('h3')).toHaveAttribute('id', 'market-closed-m7-title')
  })

  it('is not focusable without a DOM id', () => {
    render(
      <MarketCard
        id="m8"
        title="Will the choir sing?"
        status="open"
        kind="binary"
        closeAt="2026-10-04T16:30:00.000Z"
        resolvedAt={null}
        outcomes={[]}
        resolvedOutcomeLabel={null}
      />,
    )
    expect(screen.getByRole('article')).not.toHaveAttribute('tabindex')
    expect(screen.getByRole('article')).not.toHaveAttribute('id')
  })
  it('adds a "Closes in" chip to an open market closing within a day, and to no other card', () => {
    const now = Date.parse('2026-10-04T14:00:00.000Z')
    // The chip's clock takes over from `now` as soon as it mounts.
    vi.useFakeTimers({ now })
    const card = (status: 'open' | 'awaiting', closeAt: string) => (
      <MarketCard
        id="m1"
        title="Who wins the chili cook-off?"
        status={status}
        kind="binary"
        closeAt={closeAt}
        resolvedAt={null}
        outcomes={[]}
        resolvedOutcomeLabel={null}
        now={now}
      />
    )
    const { rerender } = render(card('open', '2026-10-04T16:30:00.000Z'))
    expect(screen.getByText('Closes in 2h')).toBeInTheDocument()

    rerender(card('open', '2026-10-06T16:30:00.000Z'))
    expect(screen.queryByText(/Closes in/)).toBeNull()

    rerender(card('awaiting', '2026-10-04T13:00:00.000Z'))
    expect(screen.queryByText(/Closes in/)).toBeNull()
    vi.useRealTimers()
  })
})
