// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

vi.mock('next/navigation', () => ({
  usePathname: () => '/bets',
  useSearchParams: () => new URLSearchParams('tab=coins'),
  redirect: vi.fn(),
}))

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ supabase: {}, user: { id: 'me' } }),
}))

vi.mock('@/lib/markets/cancel-bet', () => ({ cancelBetAction: vi.fn() }))

const { listMyTransactions, listMyWagers, listMyCancelledBets } = vi.hoisted(() => ({
  listMyTransactions: vi.fn(),
  listMyWagers: vi.fn(),
  listMyCancelledBets: vi.fn(),
}))
vi.mock('@/lib/ledger/my-transactions', () => ({ listMyTransactions }))
vi.mock('@/lib/bets/list-my-wagers', () => ({ listMyWagers }))
vi.mock('@/lib/bets/list-my-bets', () => ({ listMyCancelledBets }))

import MyBetsPage from '@/app/(app)/bets/page'
import { CoinRows } from '@/app/(app)/bets/coin-rows'

const entries = [
  { id: 3, amount: 26, label: 'Won 26 DC on Will it rain?', createdAt: '2026-09-25T10:00:00Z' },
  { id: 2, amount: -10, label: 'Bet 10 DC on Yes · Will it rain?', createdAt: '2026-09-25T09:00:00Z' },
  { id: 1, amount: 0, label: 'Adjusted by the owner: Fixing a typo', createdAt: '2026-09-24T09:00:00Z' },
]

async function renderCoinsTab(searchParams: Record<string, string> = { tab: 'coins' }) {
  render(await MyBetsPage({ searchParams: Promise.resolve(searchParams) } as never))
}

beforeEach(() => {
  listMyTransactions.mockReset()
})

describe('CoinRows', () => {
  it('shows each movement with a signed amount in the balance-change colours', () => {
    render(<CoinRows entries={entries} rowIdPrefix="coins" />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(within(items[0]).getByText('Won 26 DC on Will it rain?')).toBeInTheDocument()
    expect(within(items[0]).getByText('+26 DC')).toHaveClass('text-win')
    expect(within(items[1]).getByText('−10 DC')).toHaveClass('text-loss')
    const zero = within(items[2]).getByText('0 DC')
    expect(zero).toHaveClass('text-ink2')
    expect(zero).not.toHaveClass('text-win')
    expect(items[2]).toHaveTextContent('Adjusted by the owner: Fixing a typo')
  })

  it('gives each row a Show more focus target', () => {
    render(<CoinRows entries={entries} rowIdPrefix="coins" />)
    const first = screen.getAllByRole('listitem')[0]
    expect(first).toHaveAttribute('id', 'coins-3')
    expect(first).toHaveAttribute('tabindex', '-1')
  })
})

describe('My bets → Coins', () => {
  it("lists the member's own movements under the current Coins tab", async () => {
    listMyTransactions.mockResolvedValue({ rows: entries, next: null, windowed: false })
    await renderCoinsTab()

    expect(listMyTransactions).toHaveBeenCalledWith({}, 'me', { top: null, bottom: null })
    expect(screen.getByRole('heading', { level: 2, name: 'Coins' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'My bets sections' })
    expect(within(nav).getByRole('link', { name: 'Coins' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Coins' })).toHaveAttribute('href', '/bets?tab=coins')
    expect(screen.getByText('Bet 10 DC on Yes · Will it rain?')).toBeInTheDocument()
    expect(listMyWagers).not.toHaveBeenCalled()
  })

  it('shows the empty state when the member has no movements', async () => {
    listMyTransactions.mockResolvedValue({ rows: [], next: null, windowed: false })
    await renderCoinsTab()

    expect(screen.getByText('No coin movements yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByText('Nothing older here.')).not.toBeInTheDocument()
  })

  it('shows "Nothing older here" instead of the empty state when a fresh window comes back empty', async () => {
    listMyTransactions.mockResolvedValue({ rows: [], next: null, windowed: true })
    await renderCoinsTab({ tab: 'coins', coins_from: 'abc' })

    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    expect(screen.queryByText('No coin movements yet.')).not.toBeInTheDocument()
  })

  it('links Show more on the coins cursor, focusing the first new row', async () => {
    listMyTransactions.mockResolvedValue({
      rows: entries,
      next: { kind: 'extend', cursor: 'CUR', firstId: '0' },
      windowed: false,
    })
    await renderCoinsTab()

    expect(screen.getByRole('link', { name: /Show more/ })).toHaveAttribute('href', '/bets?tab=coins&coins=CUR')
  })
})
