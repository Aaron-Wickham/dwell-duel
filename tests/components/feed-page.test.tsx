// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { KeysetPage } from '@/lib/pagination/keyset'
import type { FeedEvent } from '@/lib/social/describe-event'
import { noReactions } from '@/lib/social/reactions'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

const { listFeed, requestShowMoreFocus, getReactions } = vi.hoisted(() => ({
  // The real listFeed runs `alongside` with the page's ids and hands its result back (#210).
  listFeed: vi.fn(),
  requestShowMoreFocus: vi.fn(),
  getReactions: vi.fn(),
}))
vi.mock('@/lib/social/list-feed', () => ({ listFeed }))
vi.mock('@/lib/social/reactions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/social/reactions')>()),
  getReactions,
}))
vi.mock('@/lib/social/reactions-actions', () => ({ setReactionAction: vi.fn() }))
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
  voidReason: null,
  creatorStake: null,
  season: null,
})

async function renderPage(feed: KeysetPage<FeedEvent>, searchParams: Record<string, string> = {}) {
  getReactions.mockResolvedValue(new Map())
  listFeed.mockImplementation(feedReturning(feed))
  render(await FeedPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }))
}

beforeEach(() => {
  listFeed.mockReset()
  requestShowMoreFocus.mockReset()
  getReactions.mockReset()
})

type Alongside = { alongside?: (ids: string[]) => Promise<unknown> }
// What the real listFeed does with `alongside`: runs it with the page's ids and returns its result on the page.
function feedReturning(page: KeysetPage<FeedEvent>) {
  return async (_supabase: unknown, opts: Alongside) => ({ ...page, alongside: await opts.alongside?.(page.rows.map((e) => e.id)) })
}

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

  it("reads the page's reactions in one call and shows them on each item", async () => {
    getReactions.mockImplementation(async () =>
      new Map([['bet:1', { ...noReactions(), fire: { count: 3, mine: true }, clap: { count: 1, mine: false } }]]),
    )
    listFeed.mockImplementation(feedReturning({ rows: [event('bet:1'), event('bet:2')], next: null, windowed: false }))
    render(await FeedPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }))

    expect(getReactions).toHaveBeenCalledTimes(1)
    expect(getReactions).toHaveBeenCalledWith({}, ['bet:1', 'bet:2'])
    const [first, second] = screen.getAllByRole('group', { name: 'Reactions' })
    expect(within(first).getByRole('button', { name: 'React fire, 3 reactions, you reacted' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(first).getByRole('button', { name: 'React clap, 1 reaction' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(second).getByRole('button', { name: 'React fire, 0 reactions' })).toHaveAttribute('aria-pressed', 'false')
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

  it('has All, Results and Mine tabs, with the choice in the URL and no cursor in their links', async () => {
    await renderPage({ rows: [event('bet:1')], next: null, windowed: false }, { show: 'mine', before: 'OLD' })
    const tabs = screen.getByRole('navigation', { name: 'Show' })
    expect(within(tabs).getByRole('link', { name: 'All' })).toHaveAttribute('href', '/feed')
    expect(within(tabs).getByRole('link', { name: 'Results' })).toHaveAttribute('href', '/feed?show=results')
    expect(within(tabs).getByRole('link', { name: 'Mine' })).toHaveAttribute('href', '/feed?show=mine')
    expect(within(tabs).getByRole('link', { name: 'Mine' })).toHaveAttribute('aria-current', 'page')
  })

  it.each([
    ['results', 'results'],
    ['mine', 'mine'],
    [undefined, 'all'],
    ['following', 'all'],
  ])('reads ?show=%s as the %s feed', async (show, expected) => {
    await renderPage({ rows: [event('bet:1')], next: null, windowed: false }, show ? { show } : {})
    expect(listFeed).toHaveBeenCalledWith({}, expect.objectContaining({ show: expected }))
  })

  it('says what an empty Results or Mine tab is waiting for, and keeps Show more on the tab', async () => {
    await renderPage({ rows: [], next: null, windowed: false }, { show: 'results' })
    expect(screen.getByText('No results yet.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing yet.')).toBeNull()
  })

  it('names an empty Mine tab', async () => {
    await renderPage({ rows: [], next: null, windowed: false }, { show: 'mine' })
    expect(screen.getByText('Nothing of yours yet.')).toBeInTheDocument()
  })

  it('keeps the tab in Show more', async () => {
    await renderPage({ rows: [event('bet:1')], next: { kind: 'extend', cursor: 'NEXT', firstId: 'bet:2' }, windowed: false }, { show: 'results' })
    expect(screen.getByRole('link', { name: 'Show more' })).toHaveAttribute('href', '/feed?show=results&before=NEXT')
  })
})
