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
  it('shows the empty state and no list when there are no events', () => {
    render(<FeedList events={[]} heading="Events" headingId="events" />)
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('lists each event under the given heading', () => {
    render(<FeedList events={[event]} heading="Recent activity" headingId="recent-activity" />)
    expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('Alice bet 5 DC on Yes in Social layer market')
  })
})
