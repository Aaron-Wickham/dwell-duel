// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarketCard } from '@/components/markets/market-card'

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
    expect(screen.queryByText('no bets yet')).not.toBeInTheDocument()
  })

  it('shows outcome pills and "no bets yet" when nothing has been staked', () => {
    render(
      <MarketCard
        id="m2"
        title="Who brings the best dessert?"
        status="awaiting"
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
    expect(screen.getByText('Awaiting resolution')).toBeInTheDocument()
    expect(screen.getByText('Grace')).toBeInTheDocument()
    expect(screen.getByText('Josh')).toBeInTheDocument()
    expect(screen.getByText('no bets yet')).toBeInTheDocument()
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
})
