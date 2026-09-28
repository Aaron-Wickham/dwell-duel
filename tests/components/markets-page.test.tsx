// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { KeysetPage } from '@/lib/pagination/keyset'
import type { MarketSummary } from '@/lib/markets/list-markets'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

const { listOpenMarkets, listClosedMarkets, readSparklines, requestShowMoreFocus } = vi.hoisted(() => ({
  listOpenMarkets: vi.fn(),
  listClosedMarkets: vi.fn(),
  readSparklines: vi.fn(),
  requestShowMoreFocus: vi.fn(),
}))
vi.mock('@/lib/markets/list-markets', () => ({ listOpenMarkets, listClosedMarkets }))
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
    seedPerOutcome: 20,
    resolvedOutcomeLabel: status === 'resolved' ? 'Yes' : null,
    resolvedAt: status === 'resolved' ? new Date(Date.now() - DAY).toISOString() : null,
    outcomes: [],
  }
}

async function renderPage(
  open: KeysetPage<MarketSummary>,
  closed: KeysetPage<MarketSummary>,
  searchParams: Record<string, string> = {},
) {
  listOpenMarkets.mockResolvedValue(open)
  listClosedMarkets.mockResolvedValue(closed)
  render(await MarketsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }))
}

// The order the page lays its landmarks out in, top to bottom: group headings and paging links.
function outline(): string[] {
  return [...document.querySelectorAll('h2, a')]
    .map((el) => el.textContent ?? '')
    .filter((text) => ['Open', 'Awaiting resolution', 'Resolved', 'Voided', 'Show more', 'Back to newest'].includes(text))
}

beforeEach(() => {
  listOpenMarkets.mockReset()
  listClosedMarkets.mockReset()
  readSparklines.mockReset()
  readSparklines.mockResolvedValue(new Map())
  requestShowMoreFocus.mockReset()
})

describe('MarketsPage', () => {
  it('reads each list from its own params, and sparklines for exactly the cards shown', async () => {
    const openTop = { ts: '2026-09-20T10:00:00Z', id: market(1, 'open').id }
    const closedEnd = { ts: '2026-09-10T10:00:00Z', id: market(9, 'voided').id }
    await renderPage(
      { rows: [market(1, 'open'), market(2, 'open', -DAY)], next: null, windowed: true },
      { rows: [market(9, 'voided')], next: null, windowed: false },
      { open_from: encodeCursor(openTop), resolved: encodeCursor(closedEnd) },
    )
    expect(listOpenMarkets).toHaveBeenCalledWith({}, { top: openTop, bottom: null })
    expect(listClosedMarkets).toHaveBeenCalledWith({}, { top: null, bottom: closedEnd })
    expect(readSparklines).toHaveBeenCalledWith({}, [market(1, 'open').id, market(2, 'open').id, market(9, 'voided').id])
  })

  it('puts the open list’s Show more under its groups and the closed list’s under theirs', async () => {
    await renderPage(
      {
        rows: [market(1, 'open'), market(2, 'open', -DAY)],
        next: { kind: 'extend', cursor: 'OPEN', firstId: market(3, 'open').id },
        windowed: false,
      },
      {
        rows: [market(8, 'resolved'), market(9, 'voided')],
        next: { kind: 'window', cursor: 'CLOSED', firstId: market(10, 'voided').id },
        windowed: false,
      },
      { tab: 'x' },
    )

    expect(outline()).toEqual(['Open', 'Awaiting resolution', 'Show more', 'Resolved', 'Voided', 'Show more'])
    const [openMore, closedMore] = screen.getAllByRole('link', { name: 'Show more' })
    expect(openMore).toHaveAttribute('href', '/markets?tab=x&open=OPEN')
    expect(openMore).toHaveAttribute('data-scroll', 'false')
    expect(closedMore).toHaveAttribute('href', '/markets?tab=x&resolved_from=CLOSED')
    expect(closedMore).toHaveAttribute('data-scroll', 'true')

    expect(openMore).toHaveAccessibleDescription('Open markets')
    expect(closedMore).toHaveAccessibleDescription('Closed markets')

    fireEvent.click(openMore)
    expect(requestShowMoreFocus).toHaveBeenLastCalledWith(`market-open-${market(3, 'open').id}`)
    fireEvent.click(closedMore)
    expect(requestShowMoreFocus).toHaveBeenLastCalledWith(`market-closed-${market(10, 'voided').id}`)
  })

  it('gives every card a focus target named for the list it came from', async () => {
    await renderPage({ rows: [market(1, 'open')], next: null, windowed: false }, { rows: [market(9, 'voided')], next: null, windowed: false })
    expect(screen.getByRole('article', { name: /Market 1/ })).toHaveAttribute('id', `market-open-${market(1, 'open').id}`)
    expect(screen.getByRole('article', { name: /Market 9/ })).toHaveAttribute('id', `market-closed-${market(9, 'voided').id}`)
  })

  it('drops the open copy of a market that resolved between the two reads, keeping only the closed card', async () => {
    const resolved = market(1, 'resolved')
    await renderPage({ rows: [market(1, 'open')], next: null, windowed: false }, { rows: [resolved], next: null, windowed: false })

    const cards = screen.getAllByRole('article', { name: /Market 1/ })
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveAttribute('id', `market-closed-${resolved.id}`)
    expect(document.querySelectorAll(`#market-closed-${resolved.id}`)).toHaveLength(1)
    expect(document.getElementById(`market-open-${resolved.id}`)).toBeNull()
  })

  it('shows Back to newest above each windowed list, leaving the other list’s position alone', async () => {
    await renderPage(
      { rows: [market(1, 'open')], next: null, windowed: true },
      { rows: [market(9, 'voided')], next: null, windowed: true },
      { open_from: 'A', resolved_from: 'B' },
    )
    expect(outline()).toEqual(['Back to newest', 'Open', 'Back to newest', 'Voided'])
    const [openBack, closedBack] = screen.getAllByRole('link', { name: 'Back to newest' })
    expect(openBack).toHaveAttribute('href', '/markets?resolved_from=B')
    expect(closedBack).toHaveAttribute('href', '/markets?open_from=A')
  })

  it('says there is nothing older for an open window past the end, and still shows the closed list', async () => {
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
