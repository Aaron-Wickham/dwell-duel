// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { WeeklyRecapCard } from '@/components/home/weekly-recap-card'
import type { WeeklyRecap } from '@/lib/home/recap'

vi.mock('next/link', () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, transitionTypes: _transitionTypes, ...props }: ComponentProps<'a'> & { href: string; transitionTypes?: string[] }) => (
    <a href={href} {...props} />
  ),
}))

const SPARSE: WeeklyRecap = {
  mode: 'so-far',
  monday: '2026-09-21',
  sunday: '2026-09-27',
  me: null,
  bestCall: null,
  upset: null,
  topTasker: null,
  closing: { total: 0, markets: [] },
}

const market = (n: number) => ({ id: `c${n}`, title: `Closing ${n}`, closeAt: '2026-10-01T16:00:00Z' })

const FULL: WeeklyRecap = {
  mode: 'last',
  monday: '2026-09-28',
  sunday: '2026-10-04',
  me: { betting: -15, bettingMoves: 3, tasks: 20 },
  bestCall: { memberName: 'Bob', marketId: 'm1', marketTitle: 'Will it rain?', stake: 10, payout: 26 },
  upset: { marketId: 'm2', marketTitle: 'Sermon past noon?', outcomeLabel: 'Yes', chance: 0.3125 },
  topTasker: { memberName: 'Carol', count: 3 },
  closing: { total: 5, markets: [market(1), market(2), market(3)] },
}

function terms(region: HTMLElement): string[] {
  return Array.from(region.querySelectorAll('dt')).map((dt) => dt.textContent ?? '')
}

describe('WeeklyRecapCard', () => {
  it('renders nothing when the week has nothing to say', () => {
    const { container } = render(<WeeklyRecapCard recap={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows every figure for a full week', () => {
    render(<WeeklyRecapCard recap={FULL} />)
    const region = screen.getByRole('region', { name: 'Last week' })
    expect(within(region).getByText('Sep 28 – Oct 4')).toBeInTheDocument()
    expect(terms(region)).toEqual(['Your betting', 'Your task rewards', 'Best call', 'Biggest upset', 'Most tasks done', 'Closing this week'])

    expect(within(region).getByText('−15 DC')).toHaveClass('text-loss')
    expect(within(region).getByText('+20 DC')).toBeInTheDocument()
    expect(region).toHaveTextContent('Bob turned 10 DC into 26 DC on Will it rain?')
    expect(within(region).getByRole('link', { name: 'Will it rain?' })).toHaveAttribute('href', '/markets/m1')
    expect(region).toHaveTextContent('Sermon past noon?: Yes won with a 31% chance')
    expect(within(region).getByRole('link', { name: 'Sermon past noon?' })).toHaveAttribute('href', '/markets/m2')
    expect(region).toHaveTextContent('Carol, 3 tasks approved')

    const closing = [1, 2, 3].map((n) => within(region).getByRole('link', { name: `Closing ${n}` }))
    expect(closing.map((l) => l.getAttribute('href'))).toEqual(['/markets/c1', '/markets/c2', '/markets/c3'])
    expect(closing[0]).toHaveClass('hit-area')
    expect(within(region).getByText(/And 2 more on/)).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: 'Markets' })).toHaveAttribute('href', '/markets')
  })

  it('shows only the lines a sparse Sunday has', () => {
    render(
      <WeeklyRecapCard
        recap={{ ...SPARSE, topTasker: { memberName: 'Carol', count: 1 }, closing: { total: 1, markets: [market(1)] } }}
      />,
    )
    const region = screen.getByRole('region', { name: 'This week so far' })
    expect(within(region).getByText('Sep 21–27')).toBeInTheDocument()
    expect(terms(region)).toEqual(['Most tasks done', 'Closing next week'])
    expect(region).toHaveTextContent('Carol, 1 task approved')
    expect(within(region).queryByText(/more on/)).toBeNull()
  })

  it('shows breaking even, and task rewards without betting', () => {
    const { unmount } = render(<WeeklyRecapCard recap={{ ...SPARSE, me: { betting: 0, bettingMoves: 2, tasks: 0 } }} />)
    let region = screen.getByRole('region', { name: 'This week so far' })
    expect(terms(region)).toEqual(['Your betting'])
    expect(within(region).getByText('0 DC')).not.toHaveClass('text-win')
    unmount()

    render(<WeeklyRecapCard recap={{ ...SPARSE, me: { betting: 0, bettingMoves: 0, tasks: 12 } }} />)
    region = screen.getByRole('region', { name: 'This week so far' })
    expect(terms(region)).toEqual(['Your task rewards'])
  })
})
