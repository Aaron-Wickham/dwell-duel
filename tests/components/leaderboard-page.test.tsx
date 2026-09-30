// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { KeysetPage } from '@/lib/pagination/keyset'
import type { LeaderboardEntry } from '@/lib/social/leaderboard'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

const { getLeaderboardPage, getYourStanding, requestShowMoreFocus, getRecords, getRace, getAwards, getPastChampions } = vi.hoisted(() => ({
  getLeaderboardPage: vi.fn(),
  getYourStanding: vi.fn(),
  requestShowMoreFocus: vi.fn(),
  getRecords: vi.fn(),
  getRace: vi.fn(),
  getAwards: vi.fn(),
  getPastChampions: vi.fn(),
}))
vi.mock('@/lib/social/leaderboard', () => ({ getLeaderboardPage, getYourStanding }))
vi.mock('@/lib/social/leaderboard-extras', () => ({ getRecords, getRace, getAwards, getPastChampions }))
// Recharts needs layout jsdom doesn't have; the chart has its own test.
vi.mock('@/components/leaderboard/race-chart-lazy', () => ({ RaceChart: ({ series }: { series: unknown[] }) => <div data-testid="race">{series.length}</div> }))
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
  getYourStanding.mockReset().mockResolvedValue({ rank: 5, memberCount: 5, score: 50, tiedWith: 0, above: { name: 'Member 4', gap: 10 } })
  requestShowMoreFocus.mockReset()
  getRecords.mockReset().mockResolvedValue(new Map())
  getRace.mockReset().mockResolvedValue([])
  getAwards.mockReset().mockResolvedValue([])
  getPastChampions.mockReset().mockResolvedValue([])
})

describe('LeaderboardPage', () => {
  it('reads the range and window cursors from before and before_from', async () => {
    const bottom = { score: 10, name: 'Member 9', id: member(9, 10, 9).id }
    await renderPage({ rows: [member(1, 50, 1), member(2, 40, 2)], next: null, windowed: false }, { before: encodeRankCursor(bottom) })
    expect(getLeaderboardPage).toHaveBeenCalledWith({}, 'all', { top: null, bottom })
  })

  it('shows Show more under the ranks, keeping the scroll position, and moves focus to the first new member', async () => {
    await renderPage({
      rows: [member(1, 50, 1), member(2, 50, 1), member(3, 40, 3), member(4, 30, 4), member(5, 30, 4)],
      next: { kind: 'extend', cursor: 'NEXT', firstId: member(6, 20, 6).id },
      windowed: false,
    })

    // The top three stand on the podium; the list carries on from fourth place, ties sharing a rank.
    expect(screen.getByRole('listitem', { name: /Rank 4.*Member 4/ })).toHaveAttribute('id', `member-${member(4, 30, 4).id}`)
    expect(screen.getAllByText('Rank 4', { exact: false })).toHaveLength(2)
    expect(screen.queryByRole('link', { name: 'Back to newest' })).toBeNull()
    const showMore = screen.getByRole('link', { name: 'Show more' })
    expect(showMore).toHaveAttribute('href', '/leaderboard?before=NEXT')
    expect(showMore).toHaveAttribute('data-scroll', 'false')

    fireEvent.click(showMore)
    expect(requestShowMoreFocus).toHaveBeenCalledWith(`member-${member(6, 20, 6).id}`)
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

  it('stands the top three on a podium, winner in the middle, and lists the rest', async () => {
    await renderPage({
      rows: [member(1, 90, 1), member(2, 80, 2), member(3, 70, 3), member(4, 60, 4)],
      next: null,
      windowed: false,
    })
    const podium = screen.getByRole('region', { name: 'Top three' })
    // Read in rank order; the winner is moved to the middle visually, with CSS order, so a screen
    // reader and the Tab key meet first place first.
    const places = within(podium).getAllByRole('listitem')
    expect(places.map((place) => within(place).getByRole('link').textContent)).toEqual(['Member 1', 'Member 2', 'Member 3'])
    expect(places.map((place) => place.className.match(/order-\d/)?.[0])).toEqual(['order-2', 'order-1', 'order-3'])
    expect(within(podium).getByRole('heading', { level: 2, name: 'Top three' })).toHaveClass('sr-only')
    expect(within(podium).getByText('90 DC')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem', { name: /Member/ })).toHaveLength(1)
  })

  it('has no podium for fewer than three, or inside a window part-way down the board', async () => {
    await renderPage({ rows: [member(1, 90, 1), member(2, 80, 2)], next: null, windowed: false })
    expect(screen.queryByRole('region', { name: 'Top three' })).toBeNull()
    expect(screen.getAllByRole('listitem', { name: /Member/ })).toHaveLength(2)
  })

  it('shows win-loss records on the rows that have settled bets', async () => {
    getRecords.mockResolvedValue(new Map([[member(4, 60, 4).id, { won: 6, lost: 3 }]]))
    await renderPage({
      rows: [member(1, 90, 1), member(2, 80, 2), member(3, 70, 3), member(4, 60, 4), member(5, 50, 5)],
      next: null,
      windowed: false,
    })
    const rows = screen.getAllByRole('listitem', { name: /Member/ })
    expect(within(rows[0]).getByText('6-3')).toBeInTheDocument()
    expect(within(rows[0]).getByText('6 won, 3 lost')).toBeInTheDocument()
    expect(within(rows[1]).queryByText(/-/)).toBeNull()
  })

  it('adds the race, awards and past champions to This month, and only the podium and records to Net worth', async () => {
    getRace.mockResolvedValue([{ id: 'a', name: 'Aaron', points: [], final: 5 }])
    getAwards.mockResolvedValue([{ kind: 'biggest_win', memberId: 'a', name: 'Aaron', avatarSrc: null, value: 64, detail: 'Will it rain?' }])
    getPastChampions.mockResolvedValue([{ season: '2026-08', memberId: 'a', name: 'Aaron', profit: 140 }])
    const board = { rows: [member(1, 90, 1), member(2, 80, 2), member(3, 70, 3)], next: null, windowed: false }

    await renderPage(board, { tab: 'month' })
    expect(screen.getByTestId('race')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'This month’s awards' })).toBeInTheDocument()
    expect(screen.getByText('+64 DC')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Past champions' })).toBeInTheDocument()
    expect(screen.getByText('+140 DC')).toBeInTheDocument()
  })

  it('reads none of the month’s extras for the Net worth board', async () => {
    await renderPage({ rows: [member(1, 90, 1), member(2, 80, 2), member(3, 70, 3)], next: null, windowed: false })
    expect(getRace).not.toHaveBeenCalled()
    expect(getAwards).not.toHaveBeenCalled()
    expect(getPastChampions).not.toHaveBeenCalled()
    expect(screen.queryByTestId('race')).toBeNull()
  })

  it('fills the Net worth side column with your standing, hidden on a phone', async () => {
    await renderPage({
      rows: [member(1, 90, 1), member(2, 80, 2), member(3, 70, 3), member(4, 60, 4), member(5, 50, 5)],
      next: null,
      windowed: false,
    })
    expect(getYourStanding).toHaveBeenCalledWith({}, 'p-me')
    const card = screen.getByRole('region', { name: 'Your standing' })
    expect(card.className).toContain('hidden')
    expect(card.className).toContain('lg:col-start-2')
    expect(within(card).getByText(/10 DC behind Member 4\./)).toBeInTheDocument()
    expect(card.parentElement?.className).toContain('lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]')
  })

  it('leaves the standing card off This month', async () => {
    await renderPage({ rows: [member(1, 90, 1), member(2, 80, 2), member(3, 70, 3), member(4, 60, 4)], next: null, windowed: false }, { tab: 'month' })
    expect(screen.queryByRole('region', { name: 'Your standing' })).toBeNull()
    expect(getYourStanding).not.toHaveBeenCalled()
  })

  it('leaves the standing card off a Net worth board that is only the podium', async () => {
    await renderPage({ rows: [member(1, 90, 1), member(2, 80, 2), member(3, 70, 3)], next: null, windowed: false })
    expect(screen.queryByRole('region', { name: 'Your standing' })).toBeNull()
  })

  it('leaves the race and awards out of a window part-way down This month', async () => {
    await renderPage(
      { rows: [member(11, 5, 11), member(12, 4, 12), member(13, 3, 13)], next: null, windowed: true },
      { tab: 'month', before_from: 'OLD' },
    )
    expect(getRace).not.toHaveBeenCalled()
    expect(getAwards).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Top three' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Past champions' })).toBeNull()
  })
})
