// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { KeysetPage } from '@/lib/pagination/keyset'
import type { FeedEvent } from '@/lib/social/describe-event'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

const { listFeed, requestShowMoreFocus } = vi.hoisted(() => ({
  listFeed: vi.fn(),
  requestShowMoreFocus: vi.fn(),
}))
vi.mock('@/lib/social/list-feed', () => ({ listFeed }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase: {}, user: { id: 'p-me' } }) }))
vi.mock('@/components/live/live-tables', () => ({ LiveTables: () => null }))
vi.mock('@/components/ui/show-more-focus', () => ({ ShowMoreFocus: () => null, requestShowMoreFocus }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
// A plain click runs onNavigate, as the App Router's Link does for a client-side navigation.
vi.mock('next/link', () => ({
  default: ({
    href,
    scroll,
    replace: _replace,
    transitionTypes: _transitionTypes,
    onNavigate,
    ...props
  }: ComponentProps<'a'> & { href: string; scroll?: boolean; replace?: boolean; transitionTypes?: string[]; onNavigate?: () => void }) => (
    <a
      href={href}
      data-scroll={String(scroll ?? true)}
      onClick={(event) => {
        event.preventDefault()
        onNavigate?.()
      }}
      {...props}
    />
  ),
}))

import FeedPage from '@/app/(app)/feed/page'

const event = (id: string): FeedEvent => ({
  id,
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
})

async function renderPage(feed: KeysetPage<FeedEvent>, searchParams: Record<string, string> = {}) {
  listFeed.mockResolvedValue(feed)
  render(await FeedPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }))
}

beforeEach(() => {
  listFeed.mockReset()
  requestShowMoreFocus.mockReset()
})

describe('FeedPage', () => {
  it('says there is nothing older, not that nothing has happened, for a window past the end', async () => {
    await renderPage({ rows: [], next: null, windowed: true }, { before_from: 'OLD' })
    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to newest' })).toHaveAttribute('href', '/feed')
    expect(screen.queryByText('Nothing yet.')).toBeNull()
  })

  it('keeps its own empty state when nothing has ever happened', async () => {
    await renderPage({ rows: [], next: null, windowed: false })
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing older here.')).toBeNull()
  })

  it('moves focus to the first new row when Show more is clicked', async () => {
    await renderPage({
      rows: [event('bet:1')],
      next: { kind: 'extend', cursor: 'NEXT', firstId: 'bet:2' },
      windowed: false,
    })
    const showMore = screen.getByRole('link', { name: 'Show more' })
    expect(showMore).toHaveAttribute('href', '/feed?before=NEXT')

    fireEvent.click(showMore)
    expect(requestShowMoreFocus).toHaveBeenCalledWith('feed-bet_003a2')
  })
})
