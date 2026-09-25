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
    expect(card).toHaveClass('pb-1', 'md:pb-1')
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
})
