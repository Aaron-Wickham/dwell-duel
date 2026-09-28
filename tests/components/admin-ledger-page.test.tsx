// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/ledger',
  useSearchParams: () => new URLSearchParams(''),
  redirect: vi.fn(),
}))

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ supabase: {}, user: { id: 'admin1' } }),
}))

vi.mock('@/lib/auth/roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/roles')>()),
  getRole: async () => 'admin',
}))

const { listAllTransactions } = vi.hoisted(() => ({ listAllTransactions: vi.fn() }))
vi.mock('@/lib/ledger/list-transactions', () => ({ listAllTransactions }))

import AdminLedgerPage from '@/app/(app)/admin/ledger/page'

describe('AdminLedgerPage', () => {
  it('shows "Nothing older here" instead of the empty state when a fresh window comes back with no rows', async () => {
    listAllTransactions.mockResolvedValue({ rows: [], next: null, windowed: true })

    const jsx = await AdminLedgerPage({ searchParams: Promise.resolve({ before_from: 'abc' }) } as never)
    render(jsx)

    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    expect(screen.queryByText('No coin movements yet.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to newest' })).toBeInTheDocument()
  })

  it('shows the plain empty state when the ledger has never had a movement', async () => {
    listAllTransactions.mockResolvedValue({ rows: [], next: null, windowed: false })

    const jsx = await AdminLedgerPage({ searchParams: Promise.resolve({}) } as never)
    render(jsx)

    expect(screen.getByText('No coin movements yet.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing older here.')).not.toBeInTheDocument()
  })
})
