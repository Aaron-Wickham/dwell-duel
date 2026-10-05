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
  { id: 3, amount: 26, label: 'Won 26 DC on Will it rain?', createdAt: '2026-09-25T14:00:00Z' },
  { id: 2, amount: -10, label: 'Bet 10 DC on Yes · Will it rain?', createdAt: '2026-09-25T13:05:00Z' },
  { id: 1, amount: 0, label: 'Adjusted by the owner: Fixing a typo', createdAt: '2026-09-24T13:00:00Z' },
]
// Noon on Sep 25, Eastern.
const NOW = new Date('2026-09-25T16:00:00Z')

async function renderCoinsTab(searchParams: Record<string, string> = { tab: 'coins' }) {
  render(await MyBetsPage({ searchParams: Promise.resolve(searchParams) } as never))
}

beforeEach(() => {
  listMyTransactions.mockReset()
})

describe('CoinRows', () => {
  it('shows each movement with a signed amount in the balance-change colours', () => {
    render(<CoinRows entries={entries} rowIdPrefix="coins" now={NOW} />)

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

  it('groups the rows under a heading per Eastern day, each row giving only its time (#418)', () => {
    render(<CoinRows entries={entries} rowIdPrefix="coins" now={NOW} />)

    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Today', 'Yesterday'])
    const [today, yesterday] = screen.getAllByRole('list')
    expect(within(today).getAllByRole('listitem')).toHaveLength(2)
    expect(within(yesterday).getAllByRole('listitem')).toHaveLength(1)
    const time = within(today).getAllByRole('listitem')[1].querySelector('time')!
    expect(time).toHaveTextContent(/^9:05\sAM$/)
    expect(time).toHaveAttribute('dateTime', '2026-09-25T13:05:00Z')
  })

  it('names an older day by its date, and its year once it is another year’s', () => {
    render(
      <CoinRows
        entries={[
          { id: 5, amount: 5, label: 'Task reward', createdAt: '2026-09-20T15:00:00Z' },
          { id: 4, amount: 5, label: 'Task reward', createdAt: '2025-12-31T15:00:00Z' },
        ]}
        rowIdPrefix="coins"
        now={NOW}
      />,
    )
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Sun, Sep 20', 'Wed, Dec 31, 2025'])
  })

  it('puts a movement just after midnight Eastern on its Eastern day, not its UTC one', () => {
    // 00:30 Eastern on Sep 25 is 04:30 UTC; 23:30 Eastern on Sep 24 is 03:30 UTC on Sep 25.
    render(
      <CoinRows
        entries={[
          { id: 2, amount: 1, label: 'After midnight', createdAt: '2026-09-25T04:30:00Z' },
          { id: 1, amount: 1, label: 'Before midnight', createdAt: '2026-09-25T03:30:00Z' },
        ]}
        rowIdPrefix="coins"
        now={NOW}
      />,
    )
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Today', 'Yesterday'])
  })

  it('gives each row a Show more focus target', () => {
    render(<CoinRows entries={entries} rowIdPrefix="coins" now={NOW} />)
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

  it('reads at the reading width, header and tabs included (#418)', async () => {
    listMyTransactions.mockResolvedValue({ rows: entries, next: null, windowed: false })
    await renderCoinsTab()
    const nav = screen.getByRole('navigation', { name: 'My bets sections' })
    expect(nav.closest('.max-w-\\[980px\\]')).toContainElement(screen.getByRole('heading', { level: 1, name: 'My bets' }))
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
