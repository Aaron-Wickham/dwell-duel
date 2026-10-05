// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarketCard, leadingOutcome, type MarketCardProps } from '@/components/markets/market-card'

vi.mock('@/components/markets/market-sparkline', () => ({
  MarketSparkline: (props: {
    kind: string
    outcomes: { label: string }[]
    points: unknown[]
    now: number
    closedAt: string
    resolvedLabel?: string | null
  }) => (
    <div
      data-testid="chart"
      data-kind={props.kind}
      data-now={props.now}
      data-points={props.points.length}
      data-closed-at={props.closedAt}
      data-resolved-label={props.resolvedLabel ?? ''}
    >
      {props.outcomes.map((o) => o.label).join(',')}
    </div>
  ),
}))

const yesNo = [
  { id: 'a', label: 'Yes', pct: 61 },
  { id: 'b', label: 'No', pct: 39 },
]

const chart: MarketCardProps['chart'] = {
  outcomes: [
    { id: 'a', label: 'Yes', series: 2 },
    { id: 'b', label: 'No', series: 1 },
  ],
  points: [{ t: 1000, shares: { a: 0.61, b: 0.39 } }],
  now: 2000,
}

function card(props: Partial<MarketCardProps> = {}) {
  return (
    <MarketCard
      id="m1"
      title="Will the sermon run past noon?"
      status="open"
      kind="binary"
      closeAt="2026-10-11T16:00:00.000Z"
      resolvedAt={null}
      outcomes={yesNo}
      resolvedOutcomeLabel={null}
      {...props}
    />
  )
}

describe('MarketCard (#389)', () => {
  it('as a preview, shows its title without a link and says when no close time is set', () => {
    render(card({ preview: true, id: 'preview', title: 'Will it snow?', closeAt: '' }))
    expect(screen.getByRole('heading', { level: 3, name: 'Will it snow?' })).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('No close time yet')).toBeInTheDocument()
  })

  it('leads with Yes’s chance and its weekly change, then the meta line, with no status chip', () => {
    const { container } = render(card({ weeklyChange: 8, betCount: 42 }))
    expect(screen.getByRole('link', { name: 'Will the sermon run past noon?' })).toHaveAttribute('href', '/markets/m1')
    expect(screen.getByText('61%')).toBeInTheDocument()
    expect(screen.getByText('Yes')).toBeInTheDocument()
    expect(screen.queryByText('39%')).toBeNull()
    expect(container.textContent).toContain('▲ Up 8 this week')
    expect(screen.getByText(/8 this week/).closest('span')).toHaveClass('text-win')
    expect(container.textContent).toContain(' · 42 bets')
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-10-11T16:00:00.000Z')
    expect(screen.queryByText('Open')).toBeNull()
  })

  it('leads with Yes even when No is the favourite, as its one-line chart does', () => {
    render(card({ outcomes: [{ id: 'a', label: 'Yes', pct: 34 }, { id: 'b', label: 'No', pct: 66 }], weeklyChange: -5 }))
    expect(screen.getByText('34%')).toBeInTheDocument()
    expect(screen.getByText(/5 this week/).closest('span')).toHaveClass('text-loss')
    expect(screen.getByText(/5 this week/).closest('span')!.textContent).toBe('▼ Down 5 this week')
  })

  it('says nothing of a week that didn’t move, or a market without a week of history', () => {
    const { container, rerender } = render(card({ weeklyChange: 0 }))
    expect(container.textContent).not.toContain('this week')
    rerender(card({ weeklyChange: null }))
    expect(container.textContent).not.toContain('this week')
  })

  it('names an over/under’s line in its lead label', () => {
    render(card({ kind: 'over_under', outcomes: [{ id: 'a', label: 'Over 42.5', pct: 57 }, { id: 'b', label: 'Under 42.5', pct: 43 }] }))
    expect(screen.getByText('Over 42.5')).toBeInTheDocument()
    expect(screen.getByText('57%')).toBeInTheDocument()
    expect(screen.queryByText(/Over\/Under/)).toBeNull()
  })

  it('leads a multiple-choice card with the favourite and lists the top three by chance, then how many more', () => {
    const outcomes = [
      { id: 'a', label: 'Eli', pct: 21 },
      { id: 'b', label: 'Sarah', pct: 34 },
      { id: 'c', label: 'Ruth', pct: 20 },
      { id: 'd', label: 'Tom', pct: 15 },
      { id: 'e', label: 'Ann', pct: 10 },
    ]
    const { container } = render(card({ kind: 'multiple_choice', outcomes }))
    expect(container.querySelector('.text-\\[24px\\]')).toHaveTextContent('34%')
    expect(container.textContent).toContain('Sarah 34% · Eli 21% · Ruth 20% · +2 more')
    // Each legend dot keeps its outcome's colour from its place in the list, not its rank.
    const dots = container.querySelectorAll('p span[aria-hidden="true"].size-2')
    expect([...dots].map((d) => d.className.match(/bg-s\d/)?.[0])).toEqual(['bg-s3', 'bg-s2', 'bg-s4'])
  })

  it('shows no legend on a two-outcome card', () => {
    const { container } = render(card())
    expect(container.textContent).not.toContain('Yes 61%')
  })

  it('leads a resolved card with the winner, dated from its resolution', () => {
    const { container } = render(
      card({ status: 'resolved', resolvedAt: '2026-09-21T09:05:00.000Z', resolvedOutcomeLabel: 'Yes', weeklyChange: 8, betCount: 1 }),
    )
    expect(screen.getByText('Yes won')).toBeInTheDocument()
    expect(screen.queryByText('61%')).toBeNull()
    expect(container.textContent).not.toContain('this week')
    expect(container.textContent).toContain('Resolved')
    expect(container.textContent).toContain(' · 1 bet')
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-09-21T09:05:00.000Z')
  })

  it('says a voided market was voided, dated from the void, and ends its chart there (#221)', () => {
    const { container } = render(
      card({
        status: 'voided',
        closeAt: '2026-10-04T12:00:00.000Z',
        settledAt: '2026-10-01T09:00:00.000Z',
        chart: { outcomes: [], points: [{ t: Date.parse('2026-09-30T09:00:00.000Z'), shares: { a: 0.5, b: 0.5 } }], now: Date.parse('2026-10-05T09:00:00.000Z') },
      }),
    )
    // The lead and the meta line ("Called off <time>") both say it.
    expect(screen.getAllByText(/^Called off/)).toHaveLength(2)
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-10-01T09:00:00.000Z')
    expect(screen.getByTestId('chart')).toHaveAttribute('data-closed-at', '2026-10-01T09:00:00.000Z')
  })

  it('says a market past its close is waiting for a result', () => {
    render(card({ status: 'awaiting', closeAt: '2026-10-01T12:00:00.000Z' }))
    expect(screen.getByText('Waiting for a result')).toBeInTheDocument()
  })

  it('shows outcome pills and says no bets were placed on a market closed before seeding', () => {
    render(
      card({
        status: 'voided',
        kind: 'multiple_choice',
        outcomes: [
          { id: 'a', label: 'Grace', pct: null },
          { id: 'b', label: 'Josh', pct: null },
        ],
      }),
    )
    expect(screen.getByText('Grace')).toBeInTheDocument()
    expect(screen.getByText('Josh')).toBeInTheDocument()
    expect(screen.getByText('No bets were placed.')).toBeInTheDocument()
  })

  it('stretches the title link over the card, which presses as one and skips rendering off screen', () => {
    render(card())
    expect(screen.getByRole('link', { name: 'Will the sermon run past noon?' })).toHaveClass('stretched-link')
    expect(screen.getByRole('article')).toHaveClass('pressable', 'relative', '[content-visibility:auto]')
  })

  it('renders the chart between the lead and the meta line, with the market’s kind', () => {
    const { container } = render(card({ chart }))
    const chartEl = screen.getByTestId('chart')
    expect(chartEl).toHaveAttribute('data-kind', 'binary')
    expect(chartEl).toHaveAttribute('data-now', '2000')
    expect(chartEl).toHaveAttribute('data-closed-at', '2026-10-11T16:00:00.000Z')
    expect(chartEl).toHaveAttribute('data-resolved-label', '')
    const children = Array.from(container.querySelector('article')!.children)
    const at = (el: Element) => children.findIndex((c) => c.contains(el))
    expect(at(screen.getByText('61%'))).toBeLessThan(at(chartEl))
    expect(at(chartEl)).toBeLessThan(at(container.querySelector('time')!))
  })

  it('passes the resolution time, not the close, and the winner to a market resolved before it closed', () => {
    render(
      card({
        status: 'resolved',
        closeAt: '2026-10-04T12:00:00.000Z',
        resolvedAt: '2026-10-01T09:00:00.000Z',
        settledAt: '2026-10-01T09:00:00.000Z',
        resolvedOutcomeLabel: 'Yes',
        chart,
      }),
    )
    const chartEl = screen.getByTestId('chart')
    expect(chartEl).toHaveAttribute('data-closed-at', '2026-10-01T09:00:00.000Z')
    expect(chartEl).toHaveAttribute('data-resolved-label', 'Yes')
  })

  it('omits the chart when there is no chart data, even with bets', () => {
    render(card())
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
  })

  it('shows its category only when given one', () => {
    const { rerender } = render(card())
    expect(screen.queryByText(/Category:/)).toBeNull()
    rerender(card({ category: 'Church' }))
    expect(screen.getByText('Church')).toBeInTheDocument()
  })

  it('becomes a focus target named from its title alone when given a DOM id', () => {
    render(card({ status: 'resolved', resolvedAt: '2026-10-05T16:30:00.000Z', resolvedOutcomeLabel: 'Yes', domId: 'market-resolved-m7' }))
    const article = screen.getByRole('article', { name: 'Will the sermon run past noon?' })
    expect(article).toHaveAttribute('id', 'market-resolved-m7')
    expect(article).toHaveAttribute('tabindex', '-1')
    expect(article).toHaveAttribute('aria-labelledby', 'market-resolved-m7-title')
  })

  it('is not focusable without a DOM id', () => {
    render(card({ outcomes: [] }))
    expect(screen.getByRole('article')).not.toHaveAttribute('tabindex')
    expect(screen.getByRole('article')).not.toHaveAttribute('id')
  })

  it('counts down in the meta line for an open market closing within a day', () => {
    const now = Date.parse('2026-10-04T14:00:00.000Z')
    vi.useFakeTimers({ now })
    render(card({ closeAt: '2026-10-04T16:20:00.000Z', now }))
    expect(screen.getByText(/Closes in 2h/)).toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('leadingOutcome', () => {
  it('is Yes or Over on a two-outcome market and the favourite of several, the first on a tie', () => {
    expect(leadingOutcome('binary', [{ id: 'n', label: 'No', pct: 80 }, { id: 'y', label: 'Yes', pct: 20 }])?.id).toBe('y')
    expect(leadingOutcome('multiple_choice', [{ id: 'a', label: 'A', pct: 40 }, { id: 'b', label: 'B', pct: 40 }, { id: 'c', label: 'C', pct: 20 }])?.id).toBe('a')
  })
})
