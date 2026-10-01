// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeedList } from '@/app/(app)/feed/feed-list'
import type { FeedEvent } from '@/lib/social/describe-event'

const event: FeedEvent = {
  id: '1',
  kind: 'bet_placed',
  occurredAt: '2026-09-25T12:00:00Z',
  actorId: 'a1',
  actorName: 'Alice',
  marketId: 'm1',
  marketTitle: 'Social layer market',
  outcomeLabel: 'Yes',
  amount: 5,
  legCount: null,
  taskTitle: null,
  resolutionNote: null,
  voidReason: null,
  creatorStake: null,
  season: null,
}

const NOW = Date.parse('2026-09-25T12:05:00Z')

describe('FeedList', () => {
  it('lists each event under a visible heading, with no extra list padding', () => {
    render(<FeedList now={NOW} events={[event]} heading="Recent activity" headingId="recent-activity" />)
    expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('Alice bet 5 DC on Yes in Social layer market')
    expect(screen.getByRole('list')).not.toHaveClass('px-[18px]')
  })

  it('trims the card to a 4px bottom padding under a visible heading, leaving the rows to supply the rest', () => {
    render(<FeedList now={NOW} events={[event]} heading="Recent activity" headingId="recent-activity" />)
    const card = screen.getByRole('heading', { name: 'Recent activity' }).closest('section')
    expect(card).toHaveClass('pb-1', 'md:pb-1', 'md:pt-[18px]')
  })

  it('shows a void with its reason under it', () => {
    render(
      <FeedList
        now={NOW}
        events={[{ ...event, id: 'void:m1', kind: 'market_voided', outcomeLabel: null, amount: null, voidReason: 'The picnic moved indoors.' }]}
        heading="Recent activity"
        headingId="recent-activity"
      />,
    )
    const item = screen.getByRole('listitem')
    expect(item).toHaveTextContent('Alice voided Social layer market')
    expect(item).toHaveTextContent('The picnic moved indoors.')
  })

  it('leaves out a kind it doesn’t know, keeping the rest', () => {
    const unknown = { ...event, id: 'future:1', kind: 'market_renamed' as FeedEvent['kind'] }
    render(<FeedList now={NOW} events={[unknown, event]} heading="Recent activity" headingId="recent-activity" />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('listitem')).toHaveTextContent('Alice bet 5 DC on Yes in Social layer market')
  })

  it('shows the empty state when every event is of a kind it doesn’t know', () => {
    const unknown = { ...event, id: 'future:1', kind: 'market_renamed' as FeedEvent['kind'] }
    render(<FeedList now={NOW} events={[unknown]} heading="Recent activity" headingId="recent-activity" />)
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
  })

  it('renders the empty state inside the card, under a visible heading', () => {
    render(<FeedList now={NOW} events={[]} heading="Recent activity" headingId="recent-activity" />)
    expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeInTheDocument()
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
  })

  it('keeps the empty state in the card, with a body, when the heading is hidden', () => {
    render(<FeedList now={NOW} events={[]} heading="Events" headingId="feed-events" headingHidden />)
    const card = screen.getByRole('region', { name: 'Events' })
    expect(card).toHaveClass('p-[18px]')
    expect(card).not.toHaveClass('px-0')
    expect(card).toHaveTextContent('Nothing yet.')
    expect(card).toHaveTextContent('Bets, new markets, results and finished tasks show up here as they happen.')
    expect(screen.getByRole('heading', { name: 'Events' }).firstElementChild).toHaveClass('sr-only')
  })

  it('shows a relative age for a recent event and a date once it is over a week old', () => {
    render(
      <FeedList
        now={NOW}
        events={[event, { ...event, id: '2', occurredAt: '2026-09-01T12:00:00Z' }]}
        heading="Events"
        headingId="feed-events"
      />,
    )
    expect(screen.getByText('5m ago')).toBeInTheDocument()
    expect(screen.queryByText('24d ago')).toBeNull()
    expect(screen.getByText('Sep 1')).toBeInTheDocument()
  })

  it('lists events padded inside a zero-padded card when the heading is hidden', () => {
    render(<FeedList now={NOW} events={[event]} heading="Events" headingId="feed-events" headingHidden />)
    expect(screen.getByRole('listitem')).toHaveTextContent('Alice bet 5 DC on Yes in Social layer market')
    expect(screen.getByRole('list')).toHaveClass('px-[18px]')
  })

  it('renders aboveList before the list and belowList after it, inside the visible-heading card', () => {
    render(
      <FeedList now={NOW}
        events={[event]}
        heading="Recent activity"
        headingId="recent-activity"
        aboveList={<a href="#newest">Back to newest</a>}
        belowList={<a href="#more">Show more</a>}
      />,
    )
    const card = screen.getByRole('heading', { name: 'Recent activity' }).closest('section')!
    expect(screen.getByRole('link', { name: 'Back to newest' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Show more' })).toBeInTheDocument()
    // aboveList precedes the list content, belowList follows it, inside the same card.
    const html = card.innerHTML
    expect(html.indexOf('Back to newest')).toBeLessThan(html.indexOf('Alice'))
    expect(html.indexOf('Alice')).toBeLessThan(html.indexOf('Show more'))
  })

  it('renders aboveList and belowList around a hidden-heading empty state', () => {
    render(
      <FeedList now={NOW}
        events={[]}
        heading="Events"
        headingId="feed-events"
        headingHidden
        aboveList={<a href="#newest">Back to newest</a>}
        belowList={<a href="#more">Show more</a>}
      />,
    )
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to newest' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Show more' })).toBeInTheDocument()
  })

  it('omits the slots entirely when neither is passed', () => {
    render(<FeedList now={NOW} events={[event]} heading="Recent activity" headingId="recent-activity" />)
    expect(screen.queryByRole('link', { name: 'Back to newest' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Show more' })).toBeNull()
  })

  it('gives each event a focus target named from its content, from the row id prefix', () => {
    render(<FeedList now={NOW} events={[{ ...event, id: 'bet:9' }]} heading="Events" headingId="feed-events" headingHidden rowIdPrefix="feed" />)
    // jsdom's name computation drops the spaces between inline elements that a browser keeps.
    const row = screen.getByRole('listitem', { name: /Social layer market/ })
    expect(row).toHaveAttribute('id', 'feed-bet_003a9')
    expect(row).toHaveAttribute('tabindex', '-1')
  })

  it('shows the given empty state instead of its own when there are no events', () => {
    render(
      <FeedList now={NOW}
        events={[]}
        heading="Recent activity"
        headingId="recent-activity"
        emptyState={<p>Nothing older here.</p>}
      />,
    )
    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing yet.')).toBeNull()
  })

  it("renders a month's champion linking to their profile, with no market", () => {
    const champion: FeedEvent = {
      ...event,
      id: 'season:2026-08',
      kind: 'season_champion',
      occurredAt: '2026-09-01T04:00:00Z',
      marketId: null,
      marketTitle: null,
      outcomeLabel: null,
      amount: 140,
      season: '2026-08',
    }
    render(<FeedList now={NOW} events={[champion]} heading="Recent activity" headingId="recent-activity" />)
    expect(screen.getByRole('listitem')).toHaveTextContent(/Alice was August( 2026)?’s champion with \+140 DC/)
    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/members/a1')
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })
})
