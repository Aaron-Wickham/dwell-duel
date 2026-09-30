// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { KeysetPage } from '@/lib/pagination/keyset'
import type { FeedEvent } from '@/lib/social/describe-event'

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
vi.mock('@/components/ui/show-more-focus', () => ({ ShowMoreFocus: () => null, requestShowMoreFocus }))
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

// MemberActivity is the async Server Component the member page streams behind a <Suspense>;
// jsdom can't render an async component in place there, so it's exercised directly, the same way
// the member page renders it once its own promise resolves.
import { MemberActivity } from '@/app/(app)/members/[id]/member-activity'

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
  creatorStake: null,
  season: null,
})

async function renderActivity(activity: KeysetPage<FeedEvent>, searchParams: Record<string, string> = {}) {
  getReactions.mockResolvedValue(new Map())
  listFeed.mockImplementation(feedReturning(activity))
  render(
    await MemberActivity({
      memberId: 'p-bob',
      page: { before: null, before_from: null },
      searchParams,
    } as never),
  )
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

describe('MemberActivity', () => {
  it('says there is nothing older, not that nothing has happened, for a window past the end', async () => {
    await renderActivity({ rows: [], next: null, windowed: true }, { activity_from: 'OLD' })
    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to newest' })).toHaveAttribute('href', '/members/p-bob')
    expect(screen.queryByText('Nothing yet.')).toBeNull()
  })

  it('keeps its own empty state when the member has no activity', async () => {
    await renderActivity({ rows: [], next: null, windowed: false })
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing older here.')).toBeNull()
  })

  it('moves focus to the first new row when Show more is clicked', async () => {
    await renderActivity({
      rows: [event('bet:1')],
      next: { kind: 'extend', cursor: 'NEXT', firstId: 'bet:2' },
      windowed: false,
    })
    const showMore = screen.getByRole('link', { name: 'Show more' })
    expect(showMore).toHaveAttribute('href', '/members/p-bob?activity=NEXT')

    fireEvent.click(showMore)
    expect(requestShowMoreFocus).toHaveBeenCalledWith('activity-bet_003a2')
  })
})
