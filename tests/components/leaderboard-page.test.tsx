// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { KeysetPage } from '@/lib/pagination/keyset'
import type { LeaderboardEntry } from '@/lib/social/leaderboard'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

const { getLeaderboardPage, requestShowMoreFocus } = vi.hoisted(() => ({
  getLeaderboardPage: vi.fn(),
  requestShowMoreFocus: vi.fn(),
}))
vi.mock('@/lib/social/leaderboard', () => ({ getLeaderboardPage }))
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

import LeaderboardPage from '@/app/(app)/leaderboard/page'
import { encodeRankCursor } from '@/lib/pagination/rank-cursor'

const member = (n: number, score: number, rank: number): LeaderboardEntry => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  displayName: `Member ${n}`,
  avatarSrc: null,
  score,
  rank,
})

async function renderPage(board: KeysetPage<LeaderboardEntry>, searchParams: Record<string, string> = {}) {
  getLeaderboardPage.mockResolvedValue(board)
  render(await LeaderboardPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }))
}

beforeEach(() => {
  getLeaderboardPage.mockReset()
  requestShowMoreFocus.mockReset()
})

describe('LeaderboardPage', () => {
  it('reads the range and window cursors from before and before_from', async () => {
    const bottom = { score: 10, name: 'Member 9', id: member(9, 10, 9).id }
    await renderPage({ rows: [member(1, 50, 1), member(2, 40, 2)], next: null, windowed: false }, { before: encodeRankCursor(bottom) })
    expect(getLeaderboardPage).toHaveBeenCalledWith({}, 'all', { top: null, bottom })
  })

  it('shows Show more under the ranks, keeping the scroll position, and moves focus to the first new member', async () => {
    await renderPage({
      rows: [member(1, 50, 1), member(2, 50, 1), member(3, 40, 3)],
      next: { kind: 'extend', cursor: 'NEXT', firstId: member(4, 30, 4).id },
      windowed: false,
    })

    expect(screen.getByRole('listitem', { name: /Rank 1.*Member 1/ })).toHaveAttribute('id', `member-${member(1, 50, 1).id}`)
    expect(screen.getAllByText('Rank 1', { exact: false })).toHaveLength(2)
    expect(screen.queryByRole('link', { name: 'Back to newest' })).toBeNull()
    const showMore = screen.getByRole('link', { name: 'Show more' })
    expect(showMore).toHaveAttribute('href', '/leaderboard?before=NEXT')
    expect(showMore).toHaveAttribute('data-scroll', 'false')

    fireEvent.click(showMore)
    expect(requestShowMoreFocus).toHaveBeenCalledWith(`member-${member(4, 30, 4).id}`)
  })

  it('starts a fresh window at the top of the page, with Back to newest above it', async () => {
    await renderPage(
      { rows: [member(501, 5, 498), member(502, 4, 502)], next: { kind: 'window', cursor: 'WIN', firstId: 'x' }, windowed: true },
      { before_from: 'OLD' },
    )
    expect(screen.getByRole('link', { name: 'Back to newest' })).toHaveAttribute('href', '/leaderboard')
    expect(screen.getByRole('link', { name: 'Show more' })).toHaveAttribute('href', '/leaderboard?before_from=WIN')
    expect(screen.getByRole('link', { name: 'Show more' })).toHaveAttribute('data-scroll', 'true')
    expect(screen.getByText('Rank 498')).toBeInTheDocument()
  })

  it('says there is nothing older for a window past the end, not that there are no members', async () => {
    await renderPage({ rows: [], next: null, windowed: true }, { before_from: 'OLD' })
    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to newest' })).toHaveAttribute('href', '/leaderboard')
    expect(screen.queryByText('No other members yet.')).toBeNull()
  })

  it('keeps its empty state for a board of one', async () => {
    await renderPage({ rows: [member(1, 100, 1)], next: null, windowed: false })
    expect(screen.getByText('No other members yet.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing older here.')).toBeNull()
  })

  it('ranks by net worth by default, says so, and marks its tab current', async () => {
    await renderPage({ rows: [member(1, 50, 1), member(2, 40, 2)], next: null, windowed: false })
    expect(screen.getByText('Ranked by net worth: balance plus DC riding on open bets. Ties share a rank.')).toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'Ranking' })
    expect(within(tabs).getByRole('link', { name: 'Net worth' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Net worth' })).toHaveAttribute('href', '/leaderboard')
    expect(within(tabs).getByRole('link', { name: 'This month' })).toHaveAttribute('href', '/leaderboard?tab=month')
    expect(screen.getByText('50 DC')).toBeInTheDocument()
  })

  it("reads This month from ?tab=month, with signed profits, and pages with the tab kept", async () => {
    await renderPage(
      {
        rows: [member(1, 140, 1), member(2, -30, 2)],
        next: { kind: 'extend', cursor: 'NEXT', firstId: member(3, -40, 3).id },
        windowed: false,
      },
      { tab: 'month' },
    )
    expect(getLeaderboardPage).toHaveBeenCalledWith({}, 'month', { top: null, bottom: null })
    expect(screen.getByText(/^Ranked by net betting profit in \w+: winnings and refunds minus stakes\./)).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Ranking' })).getByRole('link', { name: 'This month' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByText('+140 DC')).toBeInTheDocument()
    expect(screen.getByText('−30 DC')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Show more' })).toHaveAttribute('href', '/leaderboard?tab=month&before=NEXT')
  })

  it('says nobody has bet this month on an empty month board, even with one member', async () => {
    await renderPage({ rows: [], next: null, windowed: false }, { tab: 'month' })
    expect(screen.getByText('No bets this month yet.')).toBeInTheDocument()
    expect(screen.queryByText('No other members yet.')).toBeNull()
  })

  it('shows a month board of one, since one bettor is still a board', async () => {
    await renderPage({ rows: [member(1, 12, 1)], next: null, windowed: false }, { tab: 'month' })
    expect(screen.getByText('+12 DC')).toBeInTheDocument()
  })
})
