// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { KeysetPage } from '@/lib/pagination/keyset'
import type { MarketSummary } from '@/lib/markets/list-markets'
import type { CategoryCount } from '@/lib/markets/categories'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

const { listOpenMarkets, listResolvedMarkets, listMatchingMarkets, listCategoryCounts, readSparklines, requestShowMoreFocus, push } = vi.hoisted(() => ({
  listOpenMarkets: vi.fn(),
  listCategoryCounts: vi.fn(),
  listMatchingMarkets: vi.fn(),
  push: vi.fn(),
  listResolvedMarkets: vi.fn(),
  readSparklines: vi.fn(),
  requestShowMoreFocus: vi.fn(),
}))
vi.mock('@/lib/markets/list-markets', () => ({ listOpenMarkets, listResolvedMarkets, listMatchingMarkets }))
vi.mock('@/lib/markets/sparklines', () => ({ readSparklines }))
vi.mock('@/lib/markets/categories', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/markets/categories')>()),
  listCategoryCounts,
}))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase: {}, user: { id: 'p-me' } }) }))
vi.mock('@/components/live/live-tables', () => ({ LiveTables: () => null }))
vi.mock('@/components/ui/show-more-focus', () => ({ ShowMoreFocus: () => null, requestShowMoreFocus }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), useRouter: () => ({ push }) }))
// A plain click runs onNavigate, as the App Router's Link does for a client-side navigation.
vi.mock('next/link', () => ({
  useLinkStatus: () => ({ pending: false }),
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
const NO_CATEGORY = { categoryId: null }

function market(n: number, status: MarketSummary['status'], closeInMs = DAY): MarketSummary {
  return {
    id: `0b9c3f5e-8a1d-4c2b-9e7f-${String(n).padStart(12, '0')}`,
    title: `Market ${n}`,
    kind: 'binary',
    status,
    closeAt: new Date(Date.now() + closeInMs).toISOString(),
    createdAt: '2026-09-01T10:00:00Z',
    seedPerOutcome: 20,
    pricing: 'pool',
    liquidity: 50,
    line: null,
    edited: false,
    category: null,
    resolvedOutcomeLabel: status === 'resolved' ? 'Yes' : null,
    resolvedAt: status === 'resolved' ? new Date(Date.now() - DAY).toISOString() : null,
    settledAt: status === 'open' ? null : new Date(Date.now() - DAY).toISOString(),
    outcomes: [],
    betCount: 0,
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
    // Show more holds an invisible "Loading…" beside its label, to keep its width.
    .map((el) => (el.textContent ?? '').replace('Loading…', ''))
    .filter((text) => ['Open', 'Waiting for a result', 'Resolved', 'Voided', 'Show more', 'Back to newest'].includes(text))
}

beforeEach(() => {
  listOpenMarkets.mockReset()
  listResolvedMarkets.mockReset()
  listMatchingMarkets.mockReset()
  push.mockReset()
  readSparklines.mockReset()
  readSparklines.mockResolvedValue(new Map())
  listCategoryCounts.mockReset()
  listCategoryCounts.mockResolvedValue([])
  requestShowMoreFocus.mockReset()
})

describe('MarketsPage', () => {
  it('reads the open list from its own params, and sparklines for exactly the cards shown', async () => {
    const openTop = { ts: '2026-09-20T10:00:00Z', id: market(1, 'open').id }
    await renderPage({ rows: [market(1, 'open')], next: null, windowed: true }, EMPTY, { open_from: encodeCursor(openTop) })
    const at = expect.any(String)
    expect(listOpenMarkets).toHaveBeenCalledTimes(1)
    expect(listOpenMarkets).toHaveBeenCalledWith({}, { top: openTop, bottom: null }, { upcoming: true, at }, NO_CATEGORY)
    expect(listResolvedMarkets).not.toHaveBeenCalled()
    const facts = (m: MarketSummary) => ({
      id: m.id,
      seedPerOutcome: 20,
      pricing: 'pool',
      createdAt: '2026-09-01T10:00:00Z',
      outcomeIds: [],
      version: m.sparkVersion,
    })
    expect(readSparklines).toHaveBeenCalledWith({}, [[facts(market(1, 'open'))], [], []])
  })

  it('opens on the Open tab, its one group named for screen readers alone, with its own Show more (#389)', async () => {
    await renderPage({ rows: [market(1, 'open')], next: { kind: 'extend', cursor: 'OPEN', firstId: market(3, 'open').id }, windowed: false }, EMPTY)
    expect(outline()).toEqual(['Open', 'Show more'])
    expect(screen.getByRole('heading', { level: 2, name: 'Open' })).toHaveClass('sr-only')
    const more = screen.getByRole('link', { name: 'Show more' })
    expect(more).toHaveAttribute('href', '/markets?open=OPEN')
    expect(more).not.toHaveAttribute('aria-describedby')
    expect(more).toHaveAttribute('data-scroll', 'false')
    fireEvent.click(more)
    expect(requestShowMoreFocus).toHaveBeenLastCalledWith(`market-open-${market(3, 'open').id}`)
    expect(screen.getByRole('article', { name: /Market 1\b/ })).toHaveAttribute('id', `market-open-${market(1, 'open').id}`)
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('aria-current', 'page')
  })

  it.each(['awaiting', 'pending'])(
    'reads only the past-close side of the open list for ?status=%s, and skips the resolved list',
    async (status) => {
      await renderPage(EMPTY, EMPTY, { status }, { rows: [market(2, 'open', -DAY)], next: null, windowed: false })
      expect(listOpenMarkets).toHaveBeenCalledTimes(1)
      expect(listOpenMarkets).toHaveBeenCalledWith({}, { top: null, bottom: null }, { upcoming: false, at: expect.any(String) }, NO_CATEGORY)
      expect(listResolvedMarkets).not.toHaveBeenCalled()
      expect(screen.getByRole('link', { name: 'Waiting' })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('link', { name: 'Waiting' })).toHaveAttribute('href', '/markets?status=awaiting')
      expect(outline()).toEqual(['Waiting for a result'])
    },
  )

  it('reads only upcoming markets for the open filter', async () => {
    await renderPage({ rows: [market(1, 'open')], next: null, windowed: false }, { rows: [], next: null, windowed: false }, { status: 'open' })
    expect(listOpenMarkets).toHaveBeenCalledTimes(1)
    expect(listOpenMarkets).toHaveBeenCalledWith({}, { top: null, bottom: null }, { upcoming: true, at: expect.any(String) }, NO_CATEGORY)
    expect(listResolvedMarkets).not.toHaveBeenCalled()
  })

  it.each(['resolved', 'closed'])('reads only the resolved list, voided markets included, for ?status=%s', async (status) => {
    await renderPage(
      { rows: [], next: null, windowed: false },
      {
        rows: [market(8, 'resolved'), market(9, 'voided')],
        next: { kind: 'window', cursor: 'RESOLVED', firstId: market(10, 'voided').id },
        windowed: false,
      },
      { status },
    )
    expect(listOpenMarkets).not.toHaveBeenCalled()
    expect(listResolvedMarkets).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'Resolved' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Resolved' })).toHaveAttribute('href', '/markets?status=resolved')
    expect(outline()).toEqual(['Resolved', 'Voided', 'Show more'])
    expect(screen.getByRole('heading', { level: 2, name: 'Voided' })).not.toHaveClass('sr-only')
    const more = screen.getByRole('link', { name: 'Show more' })
    expect(more).toHaveAttribute('href', `/markets?status=${status}&resolved_from=RESOLVED`)
    expect(more).toHaveAttribute('data-scroll', 'true')
    fireEvent.click(more)
    expect(requestShowMoreFocus).toHaveBeenLastCalledWith(`market-resolved-${market(10, 'voided').id}`)
    expect(screen.getByRole('article', { name: /Market 9/ })).toHaveAttribute('id', `market-resolved-${market(9, 'voided').id}`)
  })

  it('names the tabs Open, Waiting and Resolved, with no All (#389)', async () => {
    await renderPage(EMPTY, EMPTY)
    const tabs = within(screen.getByRole('navigation', { name: 'Filter markets' })).getAllByRole('link')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Open', 'Waiting', 'Resolved'])
    expect(tabs[0]).toHaveAttribute('href', '/markets')
  })

  it.each([
    ['open', 'No open markets.'],
    ['awaiting', 'Nothing waiting for a result.'],
    ['resolved', 'No resolved markets yet.'],
  ])('names the %s filter in its empty state', async (status, title) => {
    await renderPage(EMPTY, EMPTY, { status })
    expect(screen.getByText(title)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/closed|pending/i)
  })

  it.each(['bogus', 'all'])('treats ?status=%s as Open', async (status) => {
    await renderPage({ rows: [market(1, 'open')], next: null, windowed: false }, EMPTY, { status })
    expect(listOpenMarkets).toHaveBeenCalledTimes(1)
    expect(listResolvedMarkets).not.toHaveBeenCalled()
    expect(within(screen.getByRole('navigation', { name: 'Filter markets' })).getByRole('link', { name: 'Open' })).toHaveAttribute('aria-current', 'page')
  })

  it('leads each card with its chance, weekly change and bet count', async () => {
    const DAY_S = DAY
    const m = {
      ...market(1, 'open'),
      pricing: 'lmsr' as const,
      betCount: 42,
      outcomes: [
        { id: 'y', label: 'Yes', poolTotal: 0, shares: 0, qOffset: 0 },
        { id: 'n', label: 'No', poolTotal: 0, shares: 0, qOffset: 0 },
      ],
    }
    readSparklines.mockResolvedValue(new Map([[m.id, [{ t: Date.now() - 9 * DAY_S, shares: { y: 0.42, n: 0.58 } }]]]))
    await renderPage({ rows: [m], next: null, windowed: false }, EMPTY)
    const card = screen.getByRole('article', { name: /Market 1/ })
    expect(card).toHaveTextContent('50%Yes▲ Up 8 this week')
    expect(card).toHaveTextContent('· 42 bets')
  })

  it('shows Back to newest above a windowed list, leaving the other lists’ positions alone', async () => {
    await renderPage({ rows: [market(1, 'open')], next: null, windowed: true }, EMPTY, { open_from: 'A', resolved_from: 'B' })
    expect(outline()).toEqual(['Back to newest', 'Open'])
    expect(screen.getByRole('link', { name: 'Back to newest' })).toHaveAttribute('href', '/markets?resolved_from=B')
  })

  it('says there is nothing older, not that there are no markets, when the window is past the end', async () => {
    await renderPage({ rows: [], next: null, windowed: true }, EMPTY, { open_from: 'A' })
    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    expect(screen.queryByText('No open markets.')).toBeNull()
    expect(outline()).toEqual(['Back to newest'])
  })

  it('keeps its empty state when there are no markets at all', async () => {
    await renderPage(EMPTY, EMPTY)
    expect(screen.getByText('No open markets.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing older here.')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Show more' })).toBeNull()
  })
})

describe('MarketsPage: search', () => {
  const match = (rows: MarketSummary[], extra: Partial<KeysetPage<MarketSummary>> = {}): KeysetPage<MarketSummary> => ({ rows, next: null, windowed: false, ...extra })

  async function renderNarrowed(page: KeysetPage<MarketSummary>, searchParams: Record<string, string>) {
    listMatchingMarkets.mockResolvedValue(page)
    render(await MarketsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }))
  }

  it('lists a search as one flat list across statuses, reading neither status list', async () => {
    await renderNarrowed(match([market(1, 'open'), market(2, 'resolved'), market(3, 'voided')]), { q: '  rain ' })

    expect(listMatchingMarkets).toHaveBeenCalledWith({}, { top: null, bottom: null }, { q: 'rain', categoryId: null })
    expect(listOpenMarkets).not.toHaveBeenCalled()
    expect(listResolvedMarkets).not.toHaveBeenCalled()
    expect(screen.getAllByRole('link', { name: /Market [123]/ })).toHaveLength(3)
    expect(outline()).toEqual([])
    expect(document.getElementById('markets-matches-caption')).toHaveTextContent('3 markets match “rain”. Showing matches in every status. Clear search')
    expect(screen.getByRole('link', { name: 'Clear search' })).toHaveAttribute('href', '/markets')
  })

  it('searches every status whatever the tab, with no tab current, each tab leaving the search', async () => {
    await renderNarrowed(match([market(1, 'open')]), { q: 'rain', status: 'resolved' })

    expect(listMatchingMarkets).toHaveBeenCalledWith({}, { top: null, bottom: null }, { q: 'rain', categoryId: null })
    const tabs = within(screen.getByRole('navigation', { name: 'Filter markets' })).getAllByRole('link')
    expect(tabs.filter((tab) => tab.hasAttribute('aria-current'))).toHaveLength(0)
    expect(screen.getByRole('link', { name: 'Resolved' })).toHaveAttribute('href', '/markets?status=resolved')
    expect(document.getElementById('markets-matches-caption')).toHaveTextContent('1 market matches “rain”.')
    expect(screen.getByRole('searchbox', { name: 'Search markets by title' })).toHaveValue('rain')
  })

  it('opens the phone’s search field from its icon button, and starts it open with a search in the URL', async () => {
    await renderPage(EMPTY, EMPTY)
    const button = screen.getByRole('button', { name: 'Search markets' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('search', { hidden: true })).toHaveClass('hidden', 'md:flex')
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('search')).not.toHaveClass('hidden')
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull()
  })

  it('ignores an empty search and the old ?mine= chips, showing the grouped lists of every category (#327)', async () => {
    await renderPage({ rows: [market(1, 'open')], next: null, windowed: false }, EMPTY, { mine: 'bet', q: '*' })
    expect(listMatchingMarkets).not.toHaveBeenCalled()
    expect(outline()).toEqual(['Open'])
    expect(screen.queryByRole('navigation', { name: 'Whose markets' })).toBeNull()
  })

  it('searches in the page without a reload, on Enter', async () => {
    await renderNarrowed(match([market(1, 'open')]), { q: 'rain', status: 'awaiting' })
    const box = screen.getByRole('searchbox', { name: 'Search markets by title' })
    fireEvent.change(box, { target: { value: '  potluck   night ' } })
    fireEvent.submit(box.closest('form')!)
    expect(push).toHaveBeenCalledWith('/markets?q=potluck+night')
  })

  it('says nothing matches, and offers to clear the search back to the tab it came from', async () => {
    await renderNarrowed(match([]), { q: 'potluk', status: 'awaiting' })
    expect(screen.getByText('No markets match “potluk”.')).toBeInTheDocument()
    expect(screen.getByText('Check the spelling, or try fewer words.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clear search' })).toHaveAttribute('href', '/markets?status=awaiting')
  })

  it('pages a long result list with Show more under the match prefix, without a count', async () => {
    await renderNarrowed(match([market(1, 'open')], { next: { kind: 'extend', cursor: 'NEXT', firstId: market(2, 'open').id } }), { q: 'm' })
    expect(document.getElementById('markets-matches-caption')).toHaveTextContent('Newest markets match “m”.')
    const showMore = screen.getByRole('link', { name: 'Show more' })
    expect(showMore).toHaveAttribute('href', '/markets?q=m&match=NEXT')
    fireEvent.click(showMore)
    expect(requestShowMoreFocus).toHaveBeenCalledWith(`market-match-${market(2, 'open').id}`)
  })

  it('reads the match list’s own cursor', async () => {
    const bottom = { ts: '2026-09-10T10:00:00Z', id: market(9, 'open').id }
    await renderNarrowed(match([market(1, 'open')]), { q: 'm', match: encodeCursor(bottom) })
    expect(listMatchingMarkets).toHaveBeenCalledWith({}, { top: null, bottom }, expect.anything())
  })
})

describe('MarketsPage: categories (#327)', () => {
  const cat = (n: number, name: string, openMarkets = 10 - n): CategoryCount => ({
    id: `cat-${n}`,
    name,
    slug: name.toLowerCase().replace(/ /g, '-'),
    hiddenAt: null,
    openMarkets,
    markets: openMarkets,
  })
  const TEN = ['Weather', 'Sports', 'Bible Study', 'Potluck', 'Trivia', 'Music', 'Games', 'Family', 'Arts', 'Other'].map((name, i) => cat(i, name))

  it('shows All and the eight busiest as chips, with More… for the rest', async () => {
    listCategoryCounts.mockResolvedValue(TEN)
    await renderPage(EMPTY, EMPTY, { status: 'open' })
    const chips = within(screen.getByRole('navigation', { name: 'Categories' })).getAllByRole('link')
    expect(chips.map((c) => c.textContent)).toEqual(['All', 'Weather', 'Sports', 'Bible Study', 'Potluck', 'Trivia', 'Music', 'Games', 'Family'])
    expect(chips[0]).toHaveAttribute('href', '/markets')
    expect(chips[3]).toHaveAttribute('href', '/markets?category=bible-study')
    expect(screen.getByRole('button', { name: 'More…' })).toBeInTheDocument()
    expect(document.getElementById('markets-category-caption')).toBeNull()
  })

  it('shows no category row while only one category holds markets (#389)', async () => {
    listCategoryCounts.mockResolvedValue([cat(9, 'Other'), cat(1, 'Sports', 0)])
    await renderPage(EMPTY, EMPTY)
    expect(screen.queryByRole('navigation', { name: 'Categories' })).toBeNull()
  })

  it('leaves out More… when every category fits', async () => {
    listCategoryCounts.mockResolvedValue(TEN.slice(0, 3))
    await renderPage(EMPTY, EMPTY)
    expect(screen.queryByRole('button', { name: 'More…' })).toBeNull()
  })

  it('narrows every list to the chosen category and says so, keeping it in the tabs and the search', async () => {
    listCategoryCounts.mockResolvedValue(TEN)
    const weather = { ...market(1, 'open'), category: { name: 'Weather', slug: 'weather' } }
    await renderPage({ rows: [weather], next: null, windowed: false }, EMPTY, { category: 'Weather' })

    const scope = { categoryId: 'cat-0' }
    expect(listOpenMarkets).toHaveBeenCalledWith({}, { top: null, bottom: null }, { upcoming: true, at: expect.any(String) }, scope)
    expect(within(screen.getByRole('navigation', { name: 'Categories' })).getByRole('link', { name: 'Weather' })).toHaveAttribute('aria-current', 'page')
    expect(document.getElementById('markets-category-caption')).toHaveTextContent('Showing open markets in Weather · Show all categories')
    expect(screen.getByRole('link', { name: 'Show all categories' })).toHaveAttribute('href', '/markets')
    expect(screen.getByRole('link', { name: 'Resolved' })).toHaveAttribute('href', '/markets?status=resolved&category=weather')
    // The list is already narrowed to Weather, so no card repeats it (#387).
    expect(screen.getByRole('article', { name: /Market 1/ })).not.toHaveTextContent('Category:')
    expect(document.querySelector('input[type="hidden"][name="category"]')).toHaveValue('weather')
  })

  // #387: a category chip only while it tells markets apart.
  it('shows each card’s category under All while more than one category holds markets', async () => {
    listCategoryCounts.mockResolvedValue(TEN)
    const weather = { ...market(1, 'open'), category: { name: 'Weather', slug: 'weather' } }
    await renderPage({ rows: [weather], next: null, windowed: false }, EMPTY)
    expect(screen.getByRole('article', { name: /Market 1/ })).toHaveTextContent('Category: Weather')
  })

  it('shows no category chip while only one category holds markets', async () => {
    listCategoryCounts.mockResolvedValue([cat(9, 'Other'), cat(1, 'Sports', 0)])
    const other = { ...market(1, 'open'), category: { name: 'Other', slug: 'other' } }
    await renderPage({ rows: [other], next: null, windowed: false }, EMPTY)
    expect(screen.getByRole('article', { name: /Market 1/ })).not.toHaveTextContent('Category:')
  })

  it('adds a chosen category from beyond the busiest to the row', async () => {
    listCategoryCounts.mockResolvedValue(TEN)
    await renderPage(EMPTY, EMPTY, { category: 'arts', status: 'awaiting' })
    const chips = within(screen.getByRole('navigation', { name: 'Categories' })).getAllByRole('link')
    expect(chips.at(-1)).toHaveTextContent('Arts')
    expect(chips.at(-1)).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('No waiting markets in Arts.')).toBeInTheDocument()
    expect(document.getElementById('markets-category-caption')).toHaveTextContent('Showing waiting markets in Arts')
  })

  it('treats an unknown category as All', async () => {
    listCategoryCounts.mockResolvedValue(TEN)
    await renderPage(EMPTY, EMPTY, { category: 'nope' })
    expect(listOpenMarkets).toHaveBeenCalledWith({}, expect.anything(), expect.anything(), NO_CATEGORY)
    expect(document.getElementById('markets-category-caption')).toBeNull()
  })

  it('searches within the chosen category', async () => {
    listCategoryCounts.mockResolvedValue(TEN)
    listMatchingMarkets.mockResolvedValue(EMPTY)
    render(await MarketsPage({ params: Promise.resolve({}), searchParams: Promise.resolve({ q: 'rain', category: 'weather' }) }))
    expect(listMatchingMarkets).toHaveBeenCalledWith({}, expect.anything(), { q: 'rain', categoryId: 'cat-0' })
    expect(screen.getByText('No markets in Weather match “rain”.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clear search' })).toHaveAttribute('href', '/markets?category=weather')
  })
})
