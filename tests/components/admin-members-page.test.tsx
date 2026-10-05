// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { MemberSummary } from '@/lib/members/list-members'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/members',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  redirect: vi.fn(),
}))

// next/form needs the app router; a plain GET form is what it renders without JavaScript.
vi.mock('next/form', () => ({
  default: ({ replace: _replace, scroll: _scroll, ...props }: Record<string, unknown>) => <form {...props} />,
}))

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ supabase: {}, user: { id: 'owner1' } }),
}))

vi.mock('@/lib/auth/roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/roles')>()),
  getRole: async () => 'owner',
}))

const { listMembersPage, listMembersByValue, listMembersByNetWorth, countMembers } = vi.hoisted(() => ({
  listMembersPage: vi.fn(),
  listMembersByValue: vi.fn(),
  listMembersByNetWorth: vi.fn(),
  countMembers: vi.fn(),
}))
vi.mock('@/lib/members/list-members', () => ({ listMembersPage, listMembersByValue, listMembersByNetWorth, countMembers }))
const { readNetWorths } = vi.hoisted(() => ({ readNetWorths: vi.fn() }))
vi.mock('@/lib/members/net-worth', () => ({ readNetWorths }))

import AdminMembersPage from '@/app/(app)/admin/(sections)/members/page'

const BEN: MemberSummary = {
  id: '00000000-0000-4000-8000-0000000000b1',
  displayName: 'Ben',
  avatarSrc: null,
  email: 'ben@example.com',
  balance: 60,
  role: 'member',
  joinedAt: null,
  lastSignInAt: null,
  removed: false,
}

async function renderPage(searchParams: Record<string, string> = {}) {
  render(await AdminMembersPage({ searchParams: Promise.resolve(searchParams) } as never))
}

beforeEach(() => {
  listMembersPage.mockReset().mockResolvedValue({ rows: [BEN], next: null, windowed: false })
  listMembersByValue.mockReset().mockResolvedValue({ rows: [BEN], next: null, windowed: false })
  listMembersByNetWorth.mockReset().mockResolvedValue({ rows: [BEN], next: null, windowed: false, netWorths: new Map([[BEN.id, 90]]) })
  countMembers.mockReset().mockResolvedValue({ active: 1038, removed: 12 })
  readNetWorths.mockReset().mockResolvedValue(new Map([[BEN.id, 85]]))
})

describe('AdminMembersPage (#254)', () => {
  it('lists compact rows, each opening the member’s page, with no forms on the list', async () => {
    await renderPage()
    const section = screen.getByRole('region', { name: 'Members' })
    const row = within(section).getByRole('row', { name: /Ben/ })
    expect(within(row).getByRole('link', { name: 'Ben' })).toHaveAttribute('href', `/admin/members/${BEN.id}`)
    expect(screen.queryByLabelText('Amount')).toBeNull()
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull()
    expect(listMembersPage).toHaveBeenCalledWith({}, { query: '', removed: false, page: { top: null, bottom: null } })
  })

  // #399: a table of the page's members, with each one's net worth beside their balance.
  it('shows the members as a table, with net worth read for the page’s members', async () => {
    await renderPage()
    const table = within(screen.getByRole('region', { name: 'Members' })).getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Member',
      'Role',
      'Balance',
      'Net worth',
      'Joined',
    ])
    expect(within(table).getByRole('row', { name: /Ben/ })).toHaveTextContent('85 DC net worth')
    expect(readNetWorths).toHaveBeenCalledWith({}, [BEN.id])
  })

  it('searches by name or email from a search box', async () => {
    await renderPage()
    const search = screen.getByRole('search')
    expect(within(search).getByRole('searchbox', { name: 'Search members' })).toHaveAttribute('name', 'q')
    expect(within(search).getByRole('searchbox')).toHaveAttribute('placeholder', 'Name or email')
    expect(within(search).getByRole('button', { name: 'Search' })).toHaveAttribute('type', 'submit')
    expect(search).toHaveAttribute('action', '/admin/members')
  })

  it('switches between Active and Removed with counts, keeping the search and dropping the position', async () => {
    await renderPage({ q: 'an', after: 'abc' })
    const tabs = screen.getByRole('navigation', { name: 'Show members' })
    expect(within(tabs).getByRole('link', { name: 'Active (1,038)' })).toHaveAttribute('href', '/admin/members?q=an')
    expect(within(tabs).getByRole('link', { name: 'Active (1,038)' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Removed (12)' })).toHaveAttribute('href', '/admin/members?q=an&show=removed')
  })

  it('says how many match a search, with a way to clear it', async () => {
    countMembers.mockResolvedValue({ active: 24, removed: 1 })
    await renderPage({ q: 'an', show: 'removed' })
    expect(listMembersPage).toHaveBeenCalledWith({}, expect.objectContaining({ query: 'an', removed: true }))
    expect(screen.getByText(/1 member matches “an”\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clear search' })).toHaveAttribute('href', '/admin/members?show=removed')
    // The tab is kept on a new search.
    const search = screen.getByRole('search')
    expect(search.querySelector('input[type="hidden"][name="show"]')).toHaveAttribute('value', 'removed')
  })

  it('shows an empty state for a search with no matches', async () => {
    listMembersPage.mockResolvedValue({ rows: [], next: null, windowed: false })
    countMembers.mockResolvedValue({ active: 0, removed: 0 })
    await renderPage({ q: 'zz' })
    expect(screen.getByText('No members match “zz”.')).toBeInTheDocument()
  })

  it('pages with Show more, focusing the first new row', async () => {
    listMembersPage.mockResolvedValue({ rows: [BEN], next: { kind: 'extend', cursor: 'CUR', firstId: 'next-id' }, windowed: false })
    await renderPage({ q: 'b' })
    expect(screen.getByRole('link', { name: 'Show more' })).toHaveAttribute('href', '/admin/members?q=b&after=CUR')
  })

  // #265
  it('explains the Removed tab and marks its members', async () => {
    listMembersPage.mockResolvedValue({ rows: [{ ...BEN, removed: true }], next: null, windowed: false })
    await renderPage({ show: 'removed' })
    const section = screen.getByRole('region', { name: 'Removed members' })
    expect(section).toHaveTextContent('They can’t sign in and aren’t ranked. Their coins, bets and history stay.')
    expect(within(section).getByText('Removed')).toBeInTheDocument()
  })

  it('says nobody has been removed when nobody has', async () => {
    listMembersPage.mockResolvedValue({ rows: [], next: null, windowed: false })
    await renderPage({ show: 'removed' })
    expect(screen.getByText('Nobody has been removed.')).toBeInTheDocument()
  })

  // #418: sortable by balance, net worth and joined date, with the order in the URL.
  it('sorts A–Z by default, with headers that sort by each figure', async () => {
    await renderPage({ q: 'an' })
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: /^Member/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(within(table).getByRole('link', { name: 'Balance, sort highest balance first' })).toHaveAttribute(
      'href',
      '/admin/members?q=an&sort=balance',
    )
    expect(within(table).getByRole('link', { name: 'Net worth, sort highest net worth first' })).toHaveAttribute(
      'href',
      '/admin/members?q=an&sort=net_worth',
    )
    expect(within(table).getByRole('link', { name: 'Joined, sort newest first' })).toHaveAttribute('href', '/admin/members?q=an&sort=joined')
    expect(within(table).getByText(/Members, A–Z/)).toBeInTheDocument()
  })

  it('sorts by balance from ?sort=, turning round on a second tap and keeping the sort across tabs and searches', async () => {
    await renderPage({ sort: 'balance', after: 'abc' })
    expect(listMembersByValue).toHaveBeenCalledWith(
      {},
      { query: '', removed: false, column: 'balance', ascending: false, page: { top: null, bottom: null } },
    )
    expect(listMembersPage).not.toHaveBeenCalled()
    expect(readNetWorths).toHaveBeenCalledWith({}, [BEN.id])
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: /^Balance/ })).toHaveAttribute('aria-sort', 'descending')
    expect(within(table).getByRole('link', { name: 'Balance, sort lowest balance first' })).toHaveAttribute(
      'href',
      '/admin/members?sort=balance&dir=asc',
    )
    expect(within(table).getByRole('link', { name: 'Member, sort A–Z' })).toHaveAttribute('href', '/admin/members')
    const tabs = screen.getByRole('navigation', { name: 'Show members' })
    expect(within(tabs).getByRole('link', { name: 'Removed (12)' })).toHaveAttribute('href', '/admin/members?show=removed&sort=balance')
    expect(screen.getByRole('search').querySelector('input[type="hidden"][name="sort"]')).toHaveAttribute('value', 'balance')
  })

  it('sorts by when they joined, oldest first', async () => {
    await renderPage({ sort: 'joined', dir: 'asc', show: 'removed' })
    expect(listMembersByValue).toHaveBeenCalledWith({}, expect.objectContaining({ removed: true, column: 'joined_at', ascending: true }))
    expect(screen.getByRole('columnheader', { name: /^Joined/ })).toHaveAttribute('aria-sort', 'ascending')
  })

  it('sorts the Active tab by net worth, using the net worths it read', async () => {
    await renderPage({ sort: 'net_worth' })
    expect(listMembersByNetWorth).toHaveBeenCalledWith({}, { query: '', ascending: false, page: { top: null, bottom: null } })
    expect(readNetWorths).not.toHaveBeenCalled()
    expect(screen.getByRole('row', { name: /Ben/ })).toHaveTextContent('90 DC net worth')
  })

  it('can’t sort the Removed tab by net worth, falling back to A–Z', async () => {
    listMembersPage.mockResolvedValue({ rows: [{ ...BEN, removed: true }], next: null, windowed: false })
    await renderPage({ sort: 'net_worth', show: 'removed' })
    expect(listMembersByNetWorth).not.toHaveBeenCalled()
    expect(listMembersPage).toHaveBeenCalled()
    expect(within(screen.getByRole('columnheader', { name: 'Net worth' })).queryByRole('link')).toBeNull()
  })
})
