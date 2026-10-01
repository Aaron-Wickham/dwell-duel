// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { KeysetPage } from '@/lib/pagination/keyset'
import type { MarketSummary } from '@/lib/markets/list-markets'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

const { listOpenMarkets, listResolvedMarkets, readSparklines, requestShowMoreFocus } = vi.hoisted(() => ({
  listOpenMarkets: vi.fn(),
  listResolvedMarkets: vi.fn(),
  readSparklines: vi.fn(),
  requestShowMoreFocus: vi.fn(),
}))
vi.mock('@/lib/markets/list-markets', () => ({ listOpenMarkets, listResolvedMarkets }))
vi.mock('@/lib/markets/sparklines', () => ({ readSparklines }))
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

import MarketsPage from '@/app/(app)/markets/(list)/page'
import { encodeCursor } from '@/lib/pagination/cursor'

const DAY = 86_400_000
const EMPTY: KeysetPage<MarketSummary> = { rows: [], next: null, windowed: false }

function market(n: number, status: MarketSummary['status'], closeInMs = DAY): MarketSummary {
  return {
    id: `0b9c3f5e-8a1d-4c2b-9e7f-${String(n).padStart(12, '0')}`,
    title: `Market ${n}`,
    kind: 'binary',
    status,
    closeAt: new Date(Date.now() + closeInMs).toISOString(),
    createdAt: '2026-09-01T10:00:00Z',
    seedPerOutcome: 20,
    line: null,
    edited: false,
    resolvedOutcomeLabel: status === 'resolved' ? 'Yes' : null,
    resolvedAt: status === 'resolved' ? new Date(Date.now() - DAY).toISOString() : null,
    settledAt: status === 'open' ? null : new Date(Date.now() - DAY).toISOString(),
    outcomes: [],
    sparkVersion: status === 'open' ? '1' : 'settled',
  }
}

// The open list answers for the upcoming side of the close time, awaiting for the other.
async function renderPage(
  open: KeysetPage<MarketSummary>,
  resolved: KeysetPage<MarketSummary>,
  searchParams: Record<string, string> = {},
  awaiting: KeysetPage<MarketSummary> = EMPTY,
) {
  listOpenMarkets.mockImplementation(async (_supabase, _page, bound: { upcoming: boolean }) => (bound.upcoming ? open : awaiting))
  listResolvedMarkets.mockResolvedValue(resolved)
  render(await MarketsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }))
}

// The order the page lays its landmarks out in, top to bottom: group headings and paging links
// (not the filter tabs, whose "Open" would read as a group heading).
function outline(): string[] {
  return [...document.querySelectorAll('h2, a:not(nav a)')]
    .map((el) => el.textContent ?? '')
    .filter((text) => ['Open', 'Awaiting resolution', 'Resolved', 'Voided', 'Show more', 'Back to newest'].includes(text))
}

beforeEach(() => {
  listOpenMarkets.mockReset()
  listResolvedMarkets.mockReset()
  readSparklines.mockReset()
  readSparklines.mockResolvedValue(new Map())
  requestShowMoreFocus.mockReset()
})

describe('MarketsPage', () => {
  it('reads each list from its own params, and sparklines for exactly the cards shown, by version', async () => {
    const openTop = { ts: '2026-09-20T10:00:00Z', id: market(1, 'open').id }
    const awaitingEnd = { ts: '2026-09-15T10:00:00Z', id: market(2, 'open').id }
    const resolvedEnd = { ts: '2026-09-10T10:00:00Z', id: market(9, 'voided').id }
    await renderPage(
      { rows: [market(1, 'open')], next: null, windowed: true },
      { rows: [market(9, 'voided')], next: null, windowed: false },
      { open_from: encodeCursor(openTop), awaiting: encodeCursor(awaitingEnd), resolved: encodeCursor(resolvedEnd) },
      { rows: [market(2, 'open', -DAY)], next: null, windowed: false },
    )
    const at = expect.any(String)
    expect(listOpenMarkets).toHaveBeenCalledWith({}, { top: openTop, bottom: null }, { upcoming: true, at })
    expect(listOpenMarkets).toHaveBeenCalledWith({}, { top: null, bottom: awaitingEnd }, { upcoming: false, at })
    expect(listOpenMarkets.mock.calls[0][2].at).toBe(listOpenMarkets.mock.calls[1][2].at)
    expect(listResolvedMarkets).toHaveBeenCalledWith({}, { top: null, bottom: resolvedEnd })
    const facts = (m: MarketSummary) => ({
      id: m.id,
      seedPerOutcome: 20,
      createdAt: '2026-09-01T10:00:00Z',
      outcomeIds: [],
      version: m.sparkVersion,
    })
    expect(readSparklines).toHaveBeenCalledWith({}, [market(1, 'open'), market(2, 'open'), market(9, 'voided')].map(facts))
  })

  it('lists open markets first on All, however many are awaiting resolution, each list with its own Show more (#261)', async () => {
    const awaiting = Array.from({ length: 50 }, (_, i) => market(100 + i, 'open', -DAY - i))
    await renderPage(
      { rows: [market(1, 'open')], next: { kind: 'extend', cursor: 'OPEN', firstId: market(3, 'open').id }, windowed: false },
      { rows: [market(9, 'resolved')], next: null, windowed: false },
      {},
      { rows: awaiting, next: { kind: 'extend', cursor: 'AWAITING', firstId: market(200, 'open').id }, windowed: false },
    )

    expect(outline()).toEqual(['Open', 'Show more', 'Awaiting resolution', 'Show more', 'Resolved'])
    const [openMore, awaitingMore] = screen.getAllByRole('link', { name: 'Show more' })
    expect(openMore).toHaveAttribute('href', '/markets?open=OPEN')
    expect(openMore).toHaveAccessibleDescription('Open markets')
    expect(awaitingMore).toHaveAttribute('href', '/markets?awaiting=AWAITING')
    expect(awaitingMore).toHaveAccessibleDescription('Markets awaiting resolution')
    fireEvent.click(awaitingMore)
    expect(requestShowMoreFocus).toHaveBeenLastCalledWith(`market-awaiting-${market(200, 'open').id}`)
    expect(screen.getByRole('article', { name: /Market 100\b/ })).toHaveAttribute('id', `market-awaiting-${market(100, 'open').id}`)
  })

  it.each(['awaiting', 'pending'])(
    'reads only the past-close side of the open list for ?status=%s, and skips the resolved list',
    async (status) => {
      await renderPage(EMPTY, EMPTY, { status }, { rows: [market(2, 'open', -DAY)], next: null, windowed: false })
      expect(listOpenMarkets).toHaveBeenCalledTimes(1)
      expect(listOpenMarkets).toHaveBeenCalledWith({}, { top: null, bottom: null }, { upcoming: false, at: expect.any(String) })
      expect(listResolvedMarkets).not.toHaveBeenCalled()
      expect(screen.getByRole('link', { name: 'Awaiting' })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('link', { name: 'Awaiting' })).toHaveAttribute('href', '/markets?status=awaiting')
      expect(outline()).toEqual(['Awaiting resolution'])
    },
  )

  it('reads only upcoming markets for the open filter', async () => {
    await renderPage({ rows: [market(1, 'open')], next: null, windowed: false }, { rows: [], next: null, windowed: false }, { status: 'open' })
    expect(listOpenMarkets).toHaveBeenCalledTimes(1)
    expect(listOpenMarkets).toHaveBeenCalledWith({}, { top: null, bottom: null }, { upcoming: true, at: expect.any(String) })
    expect(listResolvedMarkets).not.toHaveBeenCalled()
  })

  it.each(['resolved', 'closed'])('reads only the resolved list, voided markets included, for ?status=%s', async (status) => {
    await renderPage(
      { rows: [], next: null, windowed: false },
      { rows: [market(8, 'resolved'), market(9, 'voided')], next: null, windowed: false },
      { status },
    )
    expect(listOpenMarkets).not.toHaveBeenCalled()
    expect(listResolvedMarkets).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'Resolved' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Resolved' })).toHaveAttribute('href', '/markets?status=resolved')
    expect(outline()).toEqual(['Resolved', 'Voided'])
  })

  it('names the tabs All, Open, Awaiting and Resolved', async () => {
    await renderPage(EMPTY, EMPTY)
    const tabs = within(screen.getByRole('navigation', { name: 'Filter markets' })).getAllByRole('link')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['All', 'Open', 'Awaiting', 'Resolved'])
  })

  it.each([
    ['open', 'No open markets.'],
    ['awaiting', 'Nothing awaiting resolution.'],
    ['resolved', 'No resolved markets yet.'],
  ])('names the %s filter in its empty state', async (status, title) => {
    await renderPage(EMPTY, EMPTY, { status })
    expect(screen.getByText(title)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/closed|pending/i)
  })

  it('treats an unknown status as All', async () => {
    await renderPage({ rows: [market(1, 'open')], next: null, windowed: false }, { rows: [], next: null, windowed: false }, { status: 'bogus' })
    expect(listOpenMarkets).toHaveBeenCalledTimes(2)
    expect(listResolvedMarkets).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page')
  })

  it('puts the open list’s Show more under its group and the resolved list’s under theirs', async () => {
    await renderPage(
      {
        rows: [market(1, 'open')],
        next: { kind: 'extend', cursor: 'OPEN', firstId: market(3, 'open').id },
        windowed: false,
      },
      {
        rows: [market(8, 'resolved'), market(9, 'voided')],
        next: { kind: 'window', cursor: 'RESOLVED', firstId: market(10, 'voided').id },
        windowed: false,
      },
      { tab: 'x' },
      { rows: [market(2, 'open', -DAY)], next: null, windowed: false },
    )

    expect(outline()).toEqual(['Open', 'Show more', 'Awaiting resolution', 'Resolved', 'Voided', 'Show more'])
    const [openMore, resolvedMore] = screen.getAllByRole('link', { name: 'Show more' })
    expect(openMore).toHaveAttribute('href', '/markets?tab=x&open=OPEN')
    expect(openMore).toHaveAttribute('data-scroll', 'false')
    expect(resolvedMore).toHaveAttribute('href', '/markets?tab=x&resolved_from=RESOLVED')
    expect(resolvedMore).toHaveAttribute('data-scroll', 'true')

    expect(openMore).toHaveAccessibleDescription('Open markets')
    expect(resolvedMore).toHaveAccessibleDescription('Resolved markets')

    fireEvent.click(openMore)
    expect(requestShowMoreFocus).toHaveBeenLastCalledWith(`market-open-${market(3, 'open').id}`)
    fireEvent.click(resolvedMore)
    expect(requestShowMoreFocus).toHaveBeenLastCalledWith(`market-resolved-${market(10, 'voided').id}`)
  })

  it('gives every card a focus target named for the list it came from', async () => {
    await renderPage({ rows: [market(1, 'open')], next: null, windowed: false }, { rows: [market(9, 'voided')], next: null, windowed: false })
    expect(screen.getByRole('article', { name: /Market 1/ })).toHaveAttribute('id', `market-open-${market(1, 'open').id}`)
    expect(screen.getByRole('article', { name: /Market 9/ })).toHaveAttribute('id', `market-resolved-${market(9, 'voided').id}`)
  })

  it('drops the open copy of a market that resolved between the two reads, keeping only the resolved card', async () => {
    const resolved = market(1, 'resolved')
    await renderPage({ rows: [market(1, 'open')], next: null, windowed: false }, { rows: [resolved], next: null, windowed: false })

    const cards = screen.getAllByRole('article', { name: /Market 1/ })
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveAttribute('id', `market-resolved-${resolved.id}`)
    expect(document.querySelectorAll(`#market-resolved-${resolved.id}`)).toHaveLength(1)
    expect(document.getElementById(`market-open-${resolved.id}`)).toBeNull()
  })

  it('shows Back to newest above each windowed list, leaving the other list’s position alone', async () => {
    await renderPage(
      { rows: [market(1, 'open')], next: null, windowed: true },
      { rows: [market(9, 'voided')], next: null, windowed: true },
      { open_from: 'A', resolved_from: 'B' },
    )
    expect(outline()).toEqual(['Back to newest', 'Open', 'Back to newest', 'Voided'])
    const [openBack, resolvedBack] = screen.getAllByRole('link', { name: 'Back to newest' })
    expect(openBack).toHaveAttribute('href', '/markets?resolved_from=B')
    expect(resolvedBack).toHaveAttribute('href', '/markets?open_from=A')
  })

  it('says there is nothing older for an open window past the end, and still shows the resolved list', async () => {
    await renderPage({ rows: [], next: null, windowed: true }, { rows: [market(9, 'voided')], next: null, windowed: false }, { open_from: 'A' })
    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    expect(screen.queryByText('No markets yet.')).toBeNull()
    expect(outline()).toEqual(['Back to newest', 'Voided'])
  })

  it('says there is nothing older, not that there are no markets, when both windows are past the end', async () => {
    await renderPage({ rows: [], next: null, windowed: true }, { rows: [], next: null, windowed: true }, { open_from: 'A', resolved_from: 'B' })
    expect(screen.getAllByText('Nothing older here.')).toHaveLength(2)
    expect(screen.queryByText('No markets yet.')).toBeNull()
  })

  it('keeps its empty state when there are no markets at all', async () => {
    await renderPage(EMPTY, EMPTY)
    expect(screen.getByText('No markets yet.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing older here.')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Show more' })).toBeNull()
  })
})
