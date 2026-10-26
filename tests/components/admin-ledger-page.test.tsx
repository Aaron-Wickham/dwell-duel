// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

// Like Next's, a redirect stops the render.
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/ledger',
  useSearchParams: () => new URLSearchParams(''),
  redirect,
}))

// The profile lookup behind ?member=<id>: from('profiles').select().eq().maybeSingle(); and a typed
// name's search (#430): from('profiles').select().ilike().order().order().limit(), matched here
// against `everyone` the way ilike would, any case, with a pattern either whole or %…%.
type Profile = { id: string; display_name: string }
const { profile, everyone, ilikes } = vi.hoisted(() => ({
  profile: { current: null as Profile | null },
  everyone: { current: [] as Profile[] },
  ilikes: [] as string[],
}))
function ilikeMatches(name: string, pattern: string): boolean {
  const contains = pattern.startsWith('%') && pattern.endsWith('%')
  const text = (contains ? pattern.slice(1, -1) : pattern).replace(/\\(.)/g, '$1').toLowerCase()
  return contains ? name.toLowerCase().includes(text) : name.toLowerCase() === text
}
const supabase = {
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: profile.current, error: null }) }),
      ilike: (_column: string, pattern: string) => {
        ilikes.push(pattern)
        const rows = everyone.current.filter((p) => ilikeMatches(p.display_name, pattern))
        const limited = { limit: async (n: number) => ({ data: rows.slice(0, n), error: null }) }
        return { order: () => ({ order: () => limited }) }
      },
    }),
  }),
}
vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ supabase, user: { id: 'admin1' } }),
}))

vi.mock('@/lib/auth/roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/roles')>()),
  getRole: async () => 'admin',
}))

const { listAllTransactions } = vi.hoisted(() => ({ listAllTransactions: vi.fn() }))
vi.mock('@/lib/ledger/list-transactions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ledger/list-transactions')>()),
  listAllTransactions,
}))

import AdminLedgerPage from '@/app/(app)/admin/(sections)/ledger/page'

const BEN = '00000000-0000-4000-8000-0000000000b1'

describe('AdminLedgerPage', () => {
  it('shows "Nothing older here" instead of the empty state when a fresh window comes back with no rows', async () => {
    listAllTransactions.mockResolvedValue({ rows: [], next: null, windowed: true })

    const jsx = await AdminLedgerPage({ searchParams: Promise.resolve({ before_from: 'abc' }) } as never)
    render(jsx)

    expect(screen.getByText('Nothing older here')).toBeInTheDocument()
    expect(screen.queryByText('No coin movements yet.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to newest' })).toBeInTheDocument()
  })

  it('shows the plain empty state when the ledger has never had a movement', async () => {
    listAllTransactions.mockResolvedValue({ rows: [], next: null, windowed: false })

    const jsx = await AdminLedgerPage({ searchParams: Promise.resolve({}) } as never)
    render(jsx)

    expect(screen.getByText('No coin movements yet.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing older here')).not.toBeInTheDocument()
  })

  // #254: a member's Admin page links here, to their movements alone.
  it('narrows to one member with ?member=, saying so, with a way back to everyone', async () => {
    profile.current = { id: BEN, display_name: 'Ben' }
    listAllTransactions.mockResolvedValue({ rows: [], next: null, windowed: false })

    render(await AdminLedgerPage({ searchParams: Promise.resolve({ member: BEN }) } as never))

    expect(listAllTransactions).toHaveBeenLastCalledWith(supabase, { top: null, bottom: null }, { memberId: BEN, type: undefined })
    expect(screen.getByText(/Showing Ben’s coin movements\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Ben' })).toHaveAttribute('href', `/admin/members/${BEN}`)
    expect(screen.getByRole('link', { name: 'Show everyone’s' })).toHaveAttribute('href', '/admin/ledger')
    expect(screen.getByText('No coin movements for Ben yet.')).toBeInTheDocument()
    profile.current = null
  })

  it('ignores a member id nobody has', async () => {
    listAllTransactions.mockResolvedValue({ rows: [], next: null, windowed: false })
    render(await AdminLedgerPage({ searchParams: Promise.resolve({ member: BEN }) } as never))
    expect(listAllTransactions).toHaveBeenLastCalledWith(supabase, { top: null, bottom: null }, { memberId: undefined, type: undefined })
    expect(screen.queryByText(/Showing/)).toBeNull()
    expect(screen.getByRole('searchbox', { name: 'Member' })).toHaveValue('')
  })

  // #418, #430: a filter control by member and by kind, kept in the URL.
  it('filters by member and kind, showing the member it is filtered to and sending their id', async () => {
    profile.current = { id: BEN, display_name: 'Ben' }
    listAllTransactions.mockResolvedValue({ rows: [], next: null, windowed: false })

    const { container } = render(
      await AdminLedgerPage({ searchParams: Promise.resolve({ member: BEN, kind: 'task_completed' }) } as never),
    )

    expect(listAllTransactions).toHaveBeenLastCalledWith(supabase, { top: null, bottom: null }, { memberId: BEN, type: 'task_completed' })
    expect(screen.getByRole('form', { name: 'Filter the ledger' })).toHaveAttribute('action', '/admin/ledger')
    const memberBox = screen.getByRole('searchbox', { name: 'Member' })
    expect(memberBox).toHaveValue('Ben')
    // The box shows the name, but the form sends the id, so filtering by kind as well never searches.
    expect(memberBox).not.toHaveAttribute('name')
    expect(container.querySelector('input[type="hidden"][name="member"]')).toHaveValue(BEN)
    expect(screen.getByRole('combobox', { name: 'Kind' })).toHaveValue('task_completed')
    expect(screen.getByRole('option', { name: 'Task reward' })).toHaveValue('task_completed')
    expect(screen.getByText('No “Task reward” movements for Ben.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Show every kind' })).toHaveAttribute('href', `/admin/ledger?member=${BEN}`)
    expect(screen.getByRole('link', { name: 'Show everyone’s' })).toHaveAttribute('href', '/admin/ledger?kind=task_completed')
    profile.current = null
  })

  // #430: a "Show more" window reads the one member it names, never the whole membership.
  it('reads only the filtered member on a Show more window, never searching names', async () => {
    profile.current = { id: BEN, display_name: 'Ben' }
    ilikes.length = 0
    listAllTransactions.mockResolvedValue({ rows: [], next: null, windowed: true })

    render(await AdminLedgerPage({ searchParams: Promise.resolve({ member: BEN, before_from: 'abc' }) } as never))

    expect(ilikes).toEqual([])
    expect(screen.getByRole('searchbox', { name: 'Member' })).toHaveValue('Ben')
    expect(screen.getByText('Nothing older here')).toBeInTheDocument()
    profile.current = null
  })

  it('turns a typed name that fits one member into their id, keeping the kind', async () => {
    everyone.current = [
      { id: BEN, display_name: 'Bob' },
      { id: '00000000-0000-4000-8000-0000000000b2', display_name: 'Bobby' },
      { id: '00000000-0000-4000-8000-0000000000c1', display_name: 'Cara' },
    ]
    listAllTransactions.mockClear()

    // A whole name picks its member even when it's part of another's.
    await expect(
      AdminLedgerPage({ searchParams: Promise.resolve({ member: ' bob ', kind: 'starting_grant', before_from: 'abc' }) } as never),
    ).rejects.toThrow(`NEXT_REDIRECT /admin/ledger?member=${BEN}&kind=starting_grant`)
    await expect(AdminLedgerPage({ searchParams: Promise.resolve({ member: 'ar' }) } as never)).rejects.toThrow(
      'NEXT_REDIRECT /admin/ledger?member=00000000-0000-4000-8000-0000000000c1',
    )
    expect(listAllTransactions).not.toHaveBeenCalled()
    everyone.current = []
  })

  it('says when a typed name fits nobody, in place of the list, with a way back to everyone', async () => {
    everyone.current = [{ id: BEN, display_name: 'Bob' }]
    listAllTransactions.mockClear()

    render(await AdminLedgerPage({ searchParams: Promise.resolve({ member: 'Zed', kind: 'task_completed' }) } as never))

    expect(listAllTransactions).not.toHaveBeenCalled()
    expect(screen.getByText('No member matches “Zed”.')).toBeInTheDocument()
    const memberBox = screen.getByRole('searchbox', { name: 'Member' })
    expect(memberBox).toHaveValue('Zed')
    expect(memberBox).toHaveAttribute('name', 'member')
    expect(memberBox).toHaveAttribute('aria-invalid', 'true')
    expect(memberBox).toHaveAccessibleDescription(/No member matches “Zed”\./)
    expect(screen.getByRole('link', { name: 'Show everyone’s' })).toHaveAttribute('href', '/admin/ledger?kind=task_completed')
    everyone.current = []
  })

  it('lists the members a typed name fits when it fits several', async () => {
    everyone.current = [
      { id: BEN, display_name: 'Ben Adams' },
      { id: '00000000-0000-4000-8000-0000000000b2', display_name: 'Ben Brown' },
    ]

    render(await AdminLedgerPage({ searchParams: Promise.resolve({ member: 'ben' }) } as never))

    expect(screen.getByText('More than one member matches “ben”.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ben Adams' })).toHaveAttribute('href', `/admin/ledger?member=${BEN}`)
    expect(screen.getByRole('link', { name: 'Ben Brown' })).toHaveAttribute('href', '/admin/ledger?member=00000000-0000-4000-8000-0000000000b2')
    everyone.current = []
  })

  it('ignores an unknown kind, and leaves an unset filter out of the URL', async () => {
    listAllTransactions.mockResolvedValue({ rows: [], next: null, windowed: false })
    render(await AdminLedgerPage({ searchParams: Promise.resolve({ kind: 'nope' }) } as never))
    expect(listAllTransactions).toHaveBeenLastCalledWith(supabase, { top: null, bottom: null }, { memberId: undefined, type: undefined })
    expect(screen.getByRole('combobox', { name: 'Kind' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Kind' })).not.toHaveAttribute('name')
    expect(screen.getByRole('searchbox', { name: 'Member' })).toHaveValue('')
    expect(screen.getByRole('searchbox', { name: 'Member' })).not.toHaveAttribute('name')
    expect(screen.getByText('No coin movements yet.')).toBeInTheDocument()
  })
})
