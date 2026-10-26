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

  // HOME-8: the tiles answer a mouse with a wash of their own colour, and a lone figure isn't tabular.
  it('gives each tile a hover wash and no tabular figures', () => {
    render(<NeedsYou counts={{ tasks: 12, markets: 1 }} showReviews showAdminMarkets marketsToResolve={NONE} balance={50} taskRewards={null} />)
    for (const name of ['12 task submissions to review', '1 market to resolve']) {
      const tile = screen.getByRole('link', { name })
      expect(tile).toHaveClass('pressable', 'isolate', 'after:bg-current', 'hover:after:opacity-8')
      expect(tile.querySelector('.tabular-nums')).toBeNull()
    }
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
    expect(screen.getByRole('link', { name: 'Time to resolve: Will the bake sale top $500?' })).toHaveAttribute('href', '/markets/k1')
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
    const row = screen.getByRole('link', { name: 'You’re out of Dwell Coin. Earn more with Tasks: they pay 5 to 25\u00A0DC.' })
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
    expect(bet).toHaveTextContent('10 DC on Yes · Pays 18 DC')
    expect(bet).toHaveTextContent('Closes Oct 6')
    expect(within(parlay).getByRole('link', { name: 'Parlay · 3 picks' })).toHaveAttribute('href', '/parlays/p1')
    expect(parlay).toHaveTextContent('5 DC · Pays 80 DC if all win')
    expect(closed).toHaveTextContent('Closed')
  })

  // HOME-3: the close is labelled, and within a day it's the time. These render in the runner's own
  // time zone, so they check the shape; formatCloseTime's own tests pin the zones.
  it('says when a bet closes, as the time within a day', () => {
    render(
      <YourBets
        openCount={2}
        markets={[]}
        now={NOW}
        wagers={[
          { kind: 'bet', key: 'bet:1', marketId: 'k1', marketTitle: 'Tonight', outcomeLabel: 'Yes', amount: 10, payout: 18, closeAt: '2026-10-04T18:00:00Z' },
          { kind: 'bet', key: 'bet:2', marketId: 'k2', marketTitle: 'Tomorrow', outcomeLabel: 'Yes', amount: 10, payout: 18, closeAt: '2026-10-05T09:30:00Z' },
        ]}
      />,
    )
    const [tonight, tomorrow] = within(screen.getByRole('region', { name: 'Your bets' })).getAllByRole('listitem')
    expect(tonight).toHaveTextContent(/Closes (tomorrow )?\d{1,2}(:\d{2})?\s[AP]M/)
    expect(tomorrow).toHaveTextContent(/Closes (tomorrow )?\d{1,2}:30\s[AP]M/)
  })

  it('says See all without a count when the count could not be read (HOME-1)', () => {
    render(
      <YourBets
        openCount={null}
        markets={[]}
        now={NOW}
        wagers={[{ kind: 'bet', key: 'bet:1', marketId: 'k1', marketTitle: 'A', outcomeLabel: 'Yes', amount: 10, payout: 18, closeAt: '2026-10-06T12:00:00Z' }]}
      />,
    )
    expect(screen.getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/bets')
  })

  it('offers the markets closing soonest when nothing is open', () => {
    render(<YourBets openCount={0} wagers={[]} now={NOW} markets={[{ id: 'k1', title: 'Who wins the chili cook-off?', closeAt: '2026-10-05T12:00:00Z' }]} />)
    const section = screen.getByRole('region', { name: 'Your bets' })
    expect(section).toHaveTextContent('No open bets.')
    const title = within(section).getByRole('link', { name: 'Who wins the chili cook-off?' })
    expect(title).toHaveAttribute('href', '/markets/k1')
    // HOME-6: the whole row opens the market, not only its title.
    expect(title).toHaveClass('stretched-link')
    expect(title.closest('li')).toHaveClass('pressable', 'hover-tint', 'relative')
    expect(title.closest('li')).toHaveTextContent(/Closes \S/)
    expect(within(section).getByRole('link', { name: 'Browse markets' })).toHaveAttribute('href', '/markets')
    expect(within(section).queryByRole('link', { name: /See all/ })).toBeNull()
  })

  it('says how to place a first bet when no market is open either (C-14)', () => {
    render(<YourBets openCount={0} wagers={[]} now={NOW} markets={[]} />)
    expect(screen.getByText('Add a pick from any market to place your first bet.')).toBeInTheDocument()
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
    expect(screen.getByText(/results and approved tasks show up here/)).toBeInTheDocument()
  })
})

describe('BalanceCard (#388)', () => {
  it('shows the balance with rank and what is in open bets on the deep teal hero, at every width (#438)', () => {
    render(<BalanceCard balance={4886} rank={218} memberCount={502} riding={{ dc: 275, wagers: 30 }} />)
    const card = screen.getByRole('region', { name: 'Balance' })
    expect(card).toHaveClass('flex', 'bg-hero', 'text-on-hero')
    expect(card).not.toHaveClass('hidden')
    expect(card).toHaveTextContent('4,886 DC')
    expect(card).toHaveTextContent('218th of 502 · 275 DC in 30 open bets')
  })

  it('leaves the rank out until there is one', () => {
    render(<BalanceCard balance={100} rank={null} memberCount={502} riding={{ dc: 0, wagers: 0 }} />)
    expect(screen.getByRole('region', { name: 'Balance' })).toHaveTextContent(/No open bets$/)
  })

  it('draws no empty line when neither rank nor stake could be read (HOME-1)', () => {
    render(<BalanceCard balance={100} rank={null} memberCount={502} riding={null} />)
    expect(screen.getByRole('region', { name: 'Balance' }).querySelectorAll('p')).toHaveLength(1)
  })
})
