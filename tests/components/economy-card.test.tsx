// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
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

vi.mock('@/lib/ledger/list-transactions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ledger/list-transactions')>()),
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
  payout_rounding_added: 0,
  payout_rounding_removed: 3,
  house_parlays_added: 30,
  house_parlays_removed: 5,
  owner_adjustments_added: 0,
  owner_adjustments_removed: 5,
  all_time_added: 351,
  all_time_removed: 10,
  unclassified: 0,
  market_maker_added: 0,
  market_maker_removed: 0,
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

    expect(within(rowFor('Starting grants')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['+300\u00A0DC', 'None'])
    expect(within(rowFor('Task rewards')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['+10\u00A0DC', 'None'])
    expect(within(rowFor('Market maker')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['0\u00A0DC', '0\u00A0DC'])
    expect(within(rowFor('Seed payouts (older results)')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['+8\u00A0DC', '−22\u00A0DC'])
    expect(within(rowFor('Payout rounding')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['0\u00A0DC', '−3\u00A0DC'])
    expect(within(rowFor('House-paid parlays')).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '+30\u00A0DC',
      '−5\u00A0DC',
    ])
    expect(within(rowFor('Owner adjustments')).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '0\u00A0DC',
      '−5\u00A0DC',
    ])
    // 348 added less 35 removed.
    expect(within(rowFor('Net change')).getByRole('cell').textContent).toBe('+313\u00A0DC')
  })

  it('says the ledger reconciles when the all-time totals match what is in circulation', () => {
    render(<EconomyCard summary={toEconomySummary(ROW)} />)
    expect(screen.getByText(/^Reconciles with the ledger/)).toBeInTheDocument()
  })

  it('says by how much it doesn’t, and flags ledger rows of a type it doesn’t count', () => {
    render(<EconomyCard summary={toEconomySummary({ ...ROW, all_time_added: 353, unclassified: 1 })} />)
    expect(
      screen.getByText('Doesn’t reconcile with the ledger: off by 2 DC. 1 ledger row has a type the panel doesn’t count.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^Reconciles with the ledger/)).not.toBeInTheDocument()
  })

  // ADM-1: what the failure means, and the incident steps rather than an adjustment.
  it('says not to adjust balances when it doesn’t reconcile, and links the incident steps', () => {
    render(<EconomyCard summary={toEconomySummary({ ...ROW, all_time_added: 353 })} />)
    expect(screen.getByText(/Don’t adjust balances to cover it/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /incident steps/ })
    const href = link.getAttribute('href')!
    expect(href).toBe('https://github.com/Aaron-Wickham/dwell-duel/blob/main/docs/OPERATIONS.md#incidents')
    expect(link).toHaveAttribute('target', '_blank')
    // The anchor names a heading in this repo, so renaming it fails here.
    expect(readFileSync(path.resolve(import.meta.dirname, '../../docs/OPERATIONS.md'), 'utf8')).toMatch(/^## Incidents$/m)
  })

  it('leaves out the incident steps while it reconciles', () => {
    render(<EconomyCard summary={toEconomySummary(ROW)} />)
    expect(screen.queryByRole('link', { name: /incident steps/ })).toBeNull()
  })

  // C-42: the explanation is folded under a summary.
  it('folds how each source is counted into a disclosure', () => {
    render(<EconomyCard summary={toEconomySummary(ROW)} />)
    const summary = screen.getByText('How each source is counted')
    expect(summary.tagName).toBe('SUMMARY')
    expect(summary.closest('details')).not.toHaveAttribute('open')
    expect(summary.closest('details')).toHaveTextContent(/Market maker is what the house paid winners/)
  })
})

describe('AdminLedgerPage’s economy card', () => {
  beforeEach(() => {
    readEconomySummary.mockReset()
    readEconomySummary.mockResolvedValue(toEconomySummary(ROW))
  })

  it('shows the owner the card above the ledger', async () => {
    role.current = 'owner'
    const page = await AdminLedgerPage({ searchParams: Promise.resolve({}) } as never)
    // Streamed behind its own Suspense (ADM-3), so it arrives after the ledger.
    await act(async () => void render(page))
    await screen.findByRole('region', { name: 'Economy' })
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'))
    expect(regions).toEqual(['economy-title', 'ledger-title'])
  })

  it('holds the card’s place with its own skeleton while the figures load', async () => {
    role.current = 'owner'
    readEconomySummary.mockReturnValue(new Promise(() => {}))
    const page = await AdminLedgerPage({ searchParams: Promise.resolve({}) } as never)
    await act(async () => void render(page))
    expect(document.querySelector('[data-skeleton="admin-economy"]')).not.toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screen.getByRole('region', { name: 'Every coin movement' })).toBeInTheDocument()
  })

  it('never reads the figures for an admin, nor shows the card', async () => {
    role.current = 'admin'
    render(await AdminLedgerPage({ searchParams: Promise.resolve({}) } as never))
    expect(readEconomySummary).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Economy' })).not.toBeInTheDocument()
    expect(screen.getByText('No coin movements yet.')).toBeInTheDocument()
  })
})
