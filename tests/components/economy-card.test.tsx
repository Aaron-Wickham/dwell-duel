// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { EconomyCard } from '@/components/admin/economy-card'
import { toEconomySummary, type EconomySummaryRow } from '@/lib/economy/summary'
import type { Role } from '@/lib/auth/roles'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/ledger',
  useSearchParams: () => new URLSearchParams(''),
  redirect: vi.fn(),
}))

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ supabase: {}, user: { id: 'u1' } }),
}))

const { role } = vi.hoisted(() => ({ role: { current: 'owner' as Role } }))
vi.mock('@/lib/auth/roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/roles')>()),
  getRole: async () => role.current,
}))

vi.mock('@/lib/ledger/list-transactions', () => ({
  listAllTransactions: async () => ({ rows: [], next: null, windowed: false }),
}))

const { readEconomySummary } = vi.hoisted(() => ({ readEconomySummary: vi.fn() }))
vi.mock('@/lib/economy/summary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/economy/summary')>()),
  readEconomySummary,
}))

import AdminLedgerPage from '@/app/(app)/admin/(sections)/ledger/page'

const ROW: EconomySummaryRow = {
  month_start: '2026-09-01T04:00:00+00:00',
  month_end: '2026-10-01T04:00:00+00:00',
  balances: 325,
  bets_at_stake: 12,
  parlays_at_stake: 4,
  starting_grants_added: 300,
  task_rewards_added: 10,
  seed_payouts_added: 8,
  seed_payouts_removed: 22,
  house_parlays_added: 30,
  house_parlays_removed: 5,
  owner_adjustments_added: 0,
  owner_adjustments_removed: 5,
  all_time_added: 348,
  all_time_removed: 7,
  unclassified: 0,
}

function rowFor(label: string) {
  return screen.getByRole('rowheader', { name: label }).closest('tr')!
}

describe('EconomyCard', () => {
  it('is a labelled section showing what is in circulation and how it splits', () => {
    render(<EconomyCard summary={toEconomySummary(ROW)} />)
    const card = screen.getByRole('region', { name: 'Economy' })
    expect(within(card).getByText('341 DC')).toBeInTheDocument()
    expect(
      within(card).getByText('325 DC in balances · 12 DC in open bets · 4 DC in open parlays'),
    ).toBeInTheDocument()
  })

  it('lists each source’s DC added and removed this Eastern month, signed like the ledger', () => {
    render(<EconomyCard summary={toEconomySummary(ROW)} />)
    expect(screen.getByRole('table', { name: 'September 2026, Eastern time' })).toBeInTheDocument()

    expect(within(rowFor('Starting grants')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['+300 DC', '—'])
    expect(within(rowFor('Task rewards')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['+10 DC', '—'])
    expect(within(rowFor('Seed payouts')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['+8 DC', '−22 DC'])
    expect(within(rowFor('House-paid parlays')).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '+30 DC',
      '−5 DC',
    ])
    expect(within(rowFor('Owner adjustments')).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '0 DC',
      '−5 DC',
    ])
    // 348 added less 32 removed.
    expect(within(rowFor('Net change')).getByRole('cell').textContent).toBe('+316 DC')
  })

  it('says the ledger reconciles when the all-time totals match what is in circulation', () => {
    render(<EconomyCard summary={toEconomySummary(ROW)} />)
    expect(screen.getByText(/^Reconciles with the ledger/)).toBeInTheDocument()
  })

  it('says by how much it doesn’t, and flags ledger rows of a type it doesn’t count', () => {
    render(<EconomyCard summary={toEconomySummary({ ...ROW, all_time_added: 350, unclassified: 1 })} />)
    expect(
      screen.getByText('Doesn’t reconcile with the ledger: off by 2 DC. 1 ledger row has a type the panel doesn’t count.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^Reconciles with the ledger/)).not.toBeInTheDocument()
  })
})

describe('AdminLedgerPage’s economy card', () => {
  beforeEach(() => {
    readEconomySummary.mockReset()
    readEconomySummary.mockResolvedValue(toEconomySummary(ROW))
  })

  it('shows the owner the card above the ledger', async () => {
    role.current = 'owner'
    render(await AdminLedgerPage({ searchParams: Promise.resolve({}) } as never))
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'))
    expect(regions).toEqual(['economy-title', 'ledger-title'])
  })

  it('never reads the figures for an admin, nor shows the card', async () => {
    role.current = 'admin'
    render(await AdminLedgerPage({ searchParams: Promise.resolve({}) } as never))
    expect(readEconomySummary).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Economy' })).not.toBeInTheDocument()
    expect(screen.getByText('No coin movements yet.')).toBeInTheDocument()
  })
})
