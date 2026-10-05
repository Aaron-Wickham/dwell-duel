// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('@number-flow/react', () => ({ default: ({ value }: { value: number }) => String(value) }))

import { NeedsYou } from '@/components/home/needs-you'
import { YourBets } from '@/components/home/your-bets'
import { HomeActivity } from '@/components/home/home-activity'
import { BalanceCard } from '@/components/home/balance-card'
import type { FeedEvent } from '@/lib/social/describe-event'

const NOW = Date.parse('2026-10-04T12:00:00Z')
const NONE = { total: 0, markets: [] }

describe('NeedsYou (#388)', () => {
  it('renders nothing when nothing waits', () => {
    const { container } = render(
      <NeedsYou counts={{ tasks: 0, markets: 0 }} showReviews showAdminMarkets marketsToResolve={NONE} balance={50} taskRewards={null} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('sends an admin to the Admin sections with work in them', () => {
    render(<NeedsYou counts={{ tasks: 12, markets: 1 }} showReviews showAdminMarkets marketsToResolve={NONE} balance={50} taskRewards={null} />)
    const section = screen.getByRole('region', { name: 'Needs you' })
    expect(within(section).getByRole('link', { name: '12 task submissions to review' })).toHaveAttribute('href', '/admin/tasks')
    expect(within(section).getByRole('link', { name: '1 market to resolve' })).toHaveAttribute('href', '/admin/markets')
  })

  it('shows a reviewer only the submissions, and a member nothing of the queue', () => {
    const { unmount } = render(
      <NeedsYou counts={{ tasks: 2, markets: 0 }} showReviews showAdminMarkets={false} marketsToResolve={NONE} balance={50} taskRewards={null} />,
    )
    expect(screen.getByRole('link', { name: '2 task submissions to review' })).toBeInTheDocument()
    unmount()
    const { container } = render(
      <NeedsYou counts={{ tasks: 0, markets: 0 }} showReviews={false} showAdminMarkets={false} marketsToResolve={NONE} balance={50} taskRewards={null} />,
    )
    expect(container.querySelector('a[href^="/admin"]')).toBeNull()
  })

  it('lists a member’s own closed markets to resolve, with the rest behind one row', () => {
    render(
      <NeedsYou
        counts={{ tasks: 0, markets: 0 }}
        showReviews={false}
        showAdminMarkets={false}
        marketsToResolve={{ total: 3, markets: [{ id: 'k1', title: 'Will the bake sale top $500?', closeAt: '2026-10-03T12:00:00Z' }] }}
        balance={50}
        taskRewards={null}
      />,
    )
    expect(screen.getByRole('link', { name: 'Will the bake sale top $500? closed. Resolve it.' })).toHaveAttribute('href', '/markets/k1')
    expect(screen.getByRole('link', { name: '2 more markets to resolve' })).toHaveAttribute('href', '/markets?status=awaiting')
  })

  it('leaves an admin’s own closed markets to the Admin count', () => {
    render(
      <NeedsYou
        counts={{ tasks: 0, markets: 1 }}
        showReviews
        showAdminMarkets
        marketsToResolve={{ total: 1, markets: [{ id: 'k1', title: 'Mine', closeAt: '2026-10-03T12:00:00Z' }] }}
        balance={50}
        taskRewards={null}
      />,
    )
    expect(screen.queryByRole('link', { name: /Mine/ })).toBeNull()
  })

  it('points a member at 0 DC to Tasks, in gold, with what tasks pay', () => {
    render(<NeedsYou counts={{ tasks: 0, markets: 0 }} showReviews={false} showAdminMarkets={false} marketsToResolve={NONE} balance={0} taskRewards={{ min: 5, max: 25 }} />)
    const row = screen.getByRole('link', { name: 'You’re out of Dwell Coin. Earn more with Tasks: they pay 5–25 DC.' })
    expect(row).toHaveAttribute('href', '/tasks')
    expect(row).toHaveClass('text-gold')
  })
})

describe('YourBets (#388)', () => {
  it('lists the open bets and parlays with what each pays, the close day, and See all', () => {
    render(
      <YourBets
        openCount={30}
        markets={[]}
        now={NOW}
        wagers={[
          { kind: 'bet', key: 'bet:1', marketId: 'k1', marketTitle: 'Will it rain on the church picnic?', outcomeLabel: 'Yes', amount: 10, payout: 18, closeAt: '2026-10-06T12:00:00Z' },
          { kind: 'parlay', key: 'parlay:p1', parlayId: 'p1', legCount: 3, stake: 5, payout: 80, estimated: false, closeAt: '2026-10-08T12:00:00Z' },
          { kind: 'bet', key: 'bet:2', marketId: 'k2', marketTitle: 'Closed already?', outcomeLabel: 'No', amount: 4, payout: 7, closeAt: '2026-10-03T12:00:00Z' },
        ]}
      />,
    )
    const section = screen.getByRole('region', { name: 'Your bets' })
    expect(within(section).getByRole('link', { name: 'See all 30' })).toHaveAttribute('href', '/bets')
    const [bet, parlay, closed] = within(section).getAllByRole('listitem')
    expect(within(bet).getByRole('link', { name: 'Will it rain on the church picnic?' })).toHaveAttribute('href', '/markets/k1')
    expect(bet).toHaveTextContent('10 DC on Yes · pays 18 DC')
    expect(bet).toHaveTextContent('Closes Oct 6')
    expect(within(parlay).getByRole('link', { name: 'Parlay · 3 picks' })).toHaveAttribute('href', '/parlays/p1')
    expect(parlay).toHaveTextContent('5 DC · pays 80 DC if all win')
    expect(closed).toHaveTextContent('Closed')
  })

  it('offers the markets closing soonest when nothing is open', () => {
    render(<YourBets openCount={0} wagers={[]} now={NOW} markets={[{ id: 'k1', title: 'Who wins the chili cook-off?', closeAt: '2026-10-05T12:00:00Z' }]} />)
    const section = screen.getByRole('region', { name: 'Your bets' })
    expect(section).toHaveTextContent('No open bets.')
    expect(within(section).getByRole('link', { name: 'Who wins the chili cook-off?' })).toHaveAttribute('href', '/markets/k1')
    expect(within(section).getByRole('link', { name: 'Browse markets' })).toHaveAttribute('href', '/markets')
    expect(within(section).queryByRole('link', { name: /See all/ })).toBeNull()
  })
})

describe('HomeActivity (#388)', () => {
  const event: FeedEvent = {
    id: 'bet:1',
    kind: 'bet_placed',
    occurredAt: '2026-10-04T11:55:00Z',
    actorId: 'a1',
    actorName: 'Grace Turner',
    marketId: 'm1',
    marketTitle: 'Will the sermon run past noon?',
    outcomeLabel: 'No',
    amount: 20,
    legCount: null,
    taskTitle: null,
    resolutionNote: null,
    voidReason: null,
    creatorStake: null,
    season: null,
  }

  it('shows the newest rows with no reactions, and See all opens Activity', () => {
    render(<HomeActivity events={[event]} now={NOW} />)
    const section = screen.getByRole('region', { name: 'Activity' })
    expect(within(section).getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/feed')
    expect(within(section).getByRole('link', { name: 'Grace Turner' })).toBeInTheDocument()
    expect(within(section).queryByRole('button')).toBeNull()
  })

  it('says nothing has happened yet', () => {
    render(<HomeActivity events={[]} now={NOW} />)
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
  })
})

describe('BalanceCard (#388)', () => {
  it('shows the balance with rank and what is riding, from lg only', () => {
    render(<BalanceCard balance={4886} rank={218} memberCount={502} ridingDc={275} ridingWagers={30} />)
    const card = screen.getByRole('region', { name: 'Balance' })
    expect(card).toHaveClass('hidden', 'lg:flex')
    expect(card).toHaveTextContent('4,886 DC')
    expect(card).toHaveTextContent('218th of 502 · 275 DC riding on 30 bets')
  })

  it('leaves the rank out until there is one', () => {
    render(<BalanceCard balance={100} rank={null} memberCount={502} ridingDc={0} ridingWagers={0} />)
    expect(screen.getByRole('region', { name: 'Balance' })).toHaveTextContent(/No open bets$/)
  })
})
