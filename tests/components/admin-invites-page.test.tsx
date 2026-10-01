// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/invites',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  redirect: vi.fn(),
}))

vi.mock('next/form', () => ({
  default: ({ replace: _replace, scroll: _scroll, ...props }: Record<string, unknown>) => <form {...props} />,
}))

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ supabase: {}, user: { id: 'admin1' } }),
}))

vi.mock('@/lib/auth/roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/roles')>()),
  getRole: async () => 'admin',
}))

vi.mock('@/lib/invites/actions', () => ({ addInviteAction: vi.fn(), revokeInviteAction: vi.fn() }))

const { listInvitesPage, countInvites } = vi.hoisted(() => ({ listInvitesPage: vi.fn(), countInvites: vi.fn() }))
vi.mock('@/lib/invites/list-invites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/invites/list-invites')>()),
  listInvitesPage,
  countInvites,
}))

import AdminInvitesPage from '@/app/(app)/admin/(sections)/invites/page'

const WAITING = { email: 'newfriend@example.com', claimed: false, createdAt: '2026-09-28T12:00:00Z' }

async function renderPage(searchParams: Record<string, string> = {}) {
  render(await AdminInvitesPage({ searchParams: Promise.resolve(searchParams) } as never))
}

beforeEach(() => {
  listInvitesPage.mockReset().mockResolvedValue({ rows: [WAITING], next: null, windowed: false })
  countInvites.mockReset().mockResolvedValue({ waiting: 86, claimed: 1050 })
})

describe('AdminInvitesPage (#254)', () => {
  it('shows waiting invites by default, each with when it was added and its actions', async () => {
    await renderPage()
    expect(listInvitesPage).toHaveBeenCalledWith({}, { query: '', claimed: false, page: { top: null, bottom: null } })
    const section = screen.getByRole('region', { name: 'Invites' })
    // Newest first, labelled like Members' A–Z.
    expect(within(section).getByText('New')).toBeInTheDocument()
    const row = within(section).getByRole('listitem')
    expect(row).toHaveTextContent('Added Sep 28')
    expect(within(row).getByRole('button', { name: 'Revoke newfriend@example.com' })).toBeInTheDocument()
  })

  it('searches by email and switches between Waiting and Claimed with counts', async () => {
    await renderPage({ q: 'friend' })
    expect(within(screen.getByRole('search')).getByRole('searchbox', { name: 'Search invites' })).toHaveValue('friend')
    const tabs = screen.getByRole('navigation', { name: 'Show invites' })
    expect(within(tabs).getByRole('link', { name: 'Waiting (86)' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Claimed (1,050)' })).toHaveAttribute('href', '/admin/invites?q=friend&show=claimed')
    expect(screen.getByText(/86 invites match “friend”\./)).toBeInTheDocument()
  })

  it('lists claimed invites on their own tab, with no actions', async () => {
    listInvitesPage.mockResolvedValue({ rows: [{ ...WAITING, claimed: true }], next: null, windowed: false })
    await renderPage({ show: 'claimed' })
    expect(listInvitesPage).toHaveBeenCalledWith({}, expect.objectContaining({ claimed: true }))
    const row = within(screen.getByRole('region', { name: 'Invites' })).getByRole('listitem')
    expect(within(row).queryByRole('button')).toBeNull()
  })

  it('pages with Show more', async () => {
    listInvitesPage.mockResolvedValue({ rows: [WAITING], next: { kind: 'extend', cursor: 'CUR', firstId: 'x@example.com' }, windowed: false })
    await renderPage()
    expect(screen.getByRole('link', { name: 'Show more' })).toHaveAttribute('href', '/admin/invites?before=CUR')
  })

  it('says when nothing is waiting', async () => {
    listInvitesPage.mockResolvedValue({ rows: [], next: null, windowed: false })
    await renderPage()
    expect(screen.getByText('No invites waiting.')).toBeInTheDocument()
  })
})
