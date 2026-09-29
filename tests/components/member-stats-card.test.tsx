// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemberStatsCard } from '@/components/members/member-stats-card'
import { toMemberStats, type MemberStatsRow } from '@/lib/members/stats'

vi.mock('next/link', () => ({
  default: ({ transitionTypes: _transitionTypes, ...props }: ComponentProps<'a'> & { transitionTypes?: string[] }) => <a {...props} />,
}))

const EMPTY: MemberStatsRow = {
  bets_won: 0,
  bets_lost: 0,
  bets_refunded: 0,
  parlays_won: 0,
  parlays_lost: 0,
  parlays_refunded: 0,
  net_profit: 0,
  biggest_win: null,
  biggest_win_market_id: null,
  biggest_win_market_title: null,
  best_parlay_multiplier: null,
  best_parlay_payout: null,
  markets_created: 0,
  tasks_completed: 0,
}

const FULL: MemberStatsRow = {
  ...EMPTY,
  bets_won: 4,
  bets_lost: 2,
  bets_refunded: 1,
  parlays_won: 1,
  parlays_lost: 3,
  // PostgREST may hand bigint and numeric back as strings.
  net_profit: '45',
  biggest_win: '30',
  biggest_win_market_id: 'm1',
  biggest_win_market_title: 'Will it snow at the retreat?',
  best_parlay_multiplier: '6.0000',
  best_parlay_payout: 60,
  markets_created: 2,
  tasks_completed: 5,
}

function stat(label: string) {
  return screen.getByText(label, { selector: 'dt' }).parentElement!
}

describe('MemberStatsCard', () => {
  it('shows the record, profit, biggest win and best parlay', () => {
    render(<MemberStatsCard stats={toMemberStats(FULL)} />)

    expect(screen.getByRole('region', { name: 'Stats' })).toBeInTheDocument()
    expect(within(stat('Solo bets')).getByText('4 won · 2 lost')).toBeInTheDocument()
    expect(within(stat('Solo bets')).getByText('1 refunded')).toBeInTheDocument()
    expect(within(stat('Parlays')).getByText('1 won · 3 lost')).toBeInTheDocument()
    expect(within(stat('Parlays')).queryByText(/refunded/)).toBeNull()
    expect(stat('Net profit')).toHaveTextContent('+45 DC')
    expect(stat('Biggest win')).toHaveTextContent('+30 DC')
    expect(within(stat('Biggest win')).getByRole('link', { name: 'Will it snow at the retreat?' })).toHaveAttribute(
      'href',
      '/markets/m1',
    )
    expect(stat('Best parlay')).toHaveTextContent('6.00×')
    expect(stat('Best parlay')).toHaveTextContent('Paid 60 DC')
    expect(stat('Markets created')).toHaveTextContent('2')
    expect(stat('Tasks completed')).toHaveTextContent('5')
    expect(screen.queryByText('No settled bets yet.')).toBeNull()
  })

  it('shows a loss as negative, and no biggest win or best parlay as none yet', () => {
    render(<MemberStatsCard stats={toMemberStats({ ...EMPTY, bets_lost: 3, net_profit: -25 })} />)

    expect(stat('Net profit')).toHaveTextContent('−25 DC')
    expect(stat('Biggest win')).toHaveTextContent('None yet')
    expect(within(stat('Biggest win')).queryByRole('link')).toBeNull()
    expect(stat('Best parlay')).toHaveTextContent('None yet')
  })

  it('reads nicely with no settled history, still counting markets and tasks', () => {
    // An open bet's stake moves net profit, but with nothing settled there's no profit to show.
    render(<MemberStatsCard stats={toMemberStats({ ...EMPTY, net_profit: -10, markets_created: 1 })} />)

    expect(screen.getByText('No settled bets yet.')).toBeInTheDocument()
    expect(screen.queryByText('Net profit')).toBeNull()
    expect(screen.queryByText('Solo bets')).toBeNull()
    expect(screen.queryByText('Biggest win')).toBeNull()
    expect(stat('Markets created')).toHaveTextContent('1')
    expect(stat('Tasks completed')).toHaveTextContent('0')
  })
})

describe('toMemberStats', () => {
  it('counts every settled wager and reads the multiplier in basis points', () => {
    const stats = toMemberStats(FULL)
    expect(stats.settled).toBe(11)
    expect(stats.netProfit).toBe(45)
    expect(stats.biggestWin).toEqual({ amount: 30, marketId: 'm1', marketTitle: 'Will it snow at the retreat?' })
    expect(stats.bestParlay).toEqual({ multiplierBp: 60_000, payout: 60 })
  })
})
