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

// The profile lookup behind ?member=: from('profiles').select().eq().maybeSingle().
const { profile } = vi.hoisted(() => ({ profile: { current: null as { id: string; display_name: string } | null } }))
const supabase = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile.current, error: null }) }) }) }),
}
vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ supabase, user: { id: 'admin1' } }),
}))

vi.mock('@/lib/auth/roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/roles')>()),
  getRole: async () => 'admin',
}))

const { listAllTransactions } = vi.hoisted(() => ({ listAllTransactions: vi.fn() }))
vi.mock('@/lib/ledger/list-transactions', () => ({ listAllTransactions }))

import AdminLedgerPage from '@/app/(app)/admin/(sections)/ledger/page'

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

  // #254: a member's Admin page links here, to their movements alone.
  it('narrows to one member with ?member=, saying so, with a way back to everyone', async () => {
    const id = '00000000-0000-4000-8000-0000000000b1'
    profile.current = { id, display_name: 'Ben' }
    listAllTransactions.mockResolvedValue({ rows: [], next: null, windowed: false })

    render(await AdminLedgerPage({ searchParams: Promise.resolve({ member: id }) } as never))

    expect(listAllTransactions).toHaveBeenLastCalledWith(supabase, { top: null, bottom: null }, id)
    expect(screen.getByText(/Showing Ben’s coin movements\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Ben' })).toHaveAttribute('href', `/admin/members/${id}`)
    expect(screen.getByRole('link', { name: 'Show everyone’s' })).toHaveAttribute('href', '/admin/ledger')
    expect(screen.getByText('No coin movements for Ben yet.')).toBeInTheDocument()
    profile.current = null
  })

  it('ignores a malformed member id', async () => {
    listAllTransactions.mockResolvedValue({ rows: [], next: null, windowed: false })
    render(await AdminLedgerPage({ searchParams: Promise.resolve({ member: 'nope' }) } as never))
    expect(listAllTransactions).toHaveBeenLastCalledWith(supabase, { top: null, bottom: null }, undefined)
    expect(screen.queryByText(/Showing/)).toBeNull()
  })
})
