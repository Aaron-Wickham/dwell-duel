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
}

describe('FeedList', () => {
  it('lists each event under a visible heading, with no extra list padding', () => {
    render(<FeedList events={[event]} heading="Recent activity" headingId="recent-activity" />)
    expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('Alice bet 5 DC on Yes in Social layer market')
    expect(screen.getByRole('list')).not.toHaveClass('px-[18px]')
  })

  it('trims the card to a 4px bottom padding under a visible heading, leaving the rows to supply the rest', () => {
    render(<FeedList events={[event]} heading="Recent activity" headingId="recent-activity" />)
    const card = screen.getByRole('heading', { name: 'Recent activity' }).closest('section')
    expect(card).toHaveClass('pb-1', 'md:pb-1', 'md:pt-[18px]')
  })

  it('renders the empty state inside the card, under a visible heading', () => {
    render(<FeedList events={[]} heading="Recent activity" headingId="recent-activity" />)
    expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeInTheDocument()
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
  })

  it('renders a bare empty state with no card when the heading is hidden and there are no events', () => {
    render(<FeedList events={[]} heading="Events" headingId="feed-events" headingHidden />)
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('lists events padded inside a zero-padded card when the heading is hidden', () => {
    render(<FeedList events={[event]} heading="Events" headingId="feed-events" headingHidden />)
    expect(screen.getByRole('listitem')).toHaveTextContent('Alice bet 5 DC on Yes in Social layer market')
    expect(screen.getByRole('list')).toHaveClass('px-[18px]')
  })

  it('renders aboveList before the list and belowList after it, inside the visible-heading card', () => {
    render(
      <FeedList
        events={[event]}
        heading="Recent activity"
        headingId="recent-activity"
        aboveList={<a href="/x">Back to newest</a>}
        belowList={<a href="/y">Show more</a>}
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
      <FeedList
        events={[]}
        heading="Events"
        headingId="feed-events"
        headingHidden
        aboveList={<a href="/x">Back to newest</a>}
        belowList={<a href="/y">Show more</a>}
      />,
    )
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to newest' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Show more' })).toBeInTheDocument()
  })

  it('omits the slots entirely when neither is passed', () => {
    render(<FeedList events={[event]} heading="Recent activity" headingId="recent-activity" />)
    expect(screen.queryByRole('link', { name: 'Back to newest' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Show more' })).toBeNull()
  })

  it('gives each event a focus target named from its content, from the row id prefix', () => {
    render(<FeedList events={[{ ...event, id: 'bet:9' }]} heading="Events" headingId="feed-events" headingHidden rowIdPrefix="feed" />)
    // jsdom's name computation drops the spaces between inline elements that a browser keeps.
    const row = screen.getByRole('listitem', { name: /Social layer market/ })
    expect(row).toHaveAttribute('id', 'feed-bet_003a9')
    expect(row).toHaveAttribute('tabindex', '-1')
  })

  it('shows the given empty state instead of its own when there are no events', () => {
    render(
      <FeedList
        events={[]}
        heading="Recent activity"
        headingId="recent-activity"
        emptyState={<p>Nothing older here.</p>}
      />,
    )
    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing yet.')).toBeNull()
  })
})
