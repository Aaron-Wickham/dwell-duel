// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { MemberSummary } from '@/lib/members/list-members'
import type { Role } from '@/lib/auth/roles'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

const { notFound, redirect } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/members/x',
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  notFound,
  redirect,
}))

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ supabase: {}, user: { id: 'owner1' } }),
}))

const { role } = vi.hoisted(() => ({ role: { current: 'owner' as Role } }))
vi.mock('@/lib/auth/roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/roles')>()),
  getRole: async () => role.current,
}))

const { getAdminMember } = vi.hoisted(() => ({ getAdminMember: vi.fn() }))
vi.mock('@/lib/members/list-members', () => ({ getAdminMember }))
vi.mock('@/lib/admin/owner-actions', () => ({ removeMemberAction: vi.fn(), reinviteMemberAction: vi.fn(), setMemberRoleAction: vi.fn() }))
vi.mock('@/lib/members/adjust-balance', () => ({ adjustBalanceAction: vi.fn() }))
// The coin history is its own streamed server component.
vi.mock('@/app/(app)/admin/members/[id]/coin-history', () => ({
  CoinHistory: ({ memberId }: { memberId: string }) => <a href={`/admin/ledger?member=${memberId}`}>Open in Ledger</a>,
  CoinHistorySkeleton: () => null,
}))

import AdminMemberPage from '@/app/(app)/admin/members/[id]/page'

const ID = '00000000-0000-4000-8000-0000000000b1'
const BEN: MemberSummary = {
  id: ID,
  displayName: 'Ben',
  avatarSrc: null,
  email: 'ben@example.com',
  balance: 60,
  role: 'reviewer',
  joinedAt: '2026-09-03T12:00:00Z',
  lastSignInAt: null,
  removed: false,
}

async function renderPage(id = ID) {
  render(await AdminMemberPage({ params: Promise.resolve({ id }) } as never))
}

beforeEach(() => {
  role.current = 'owner'
  getAdminMember.mockReset().mockResolvedValue(BEN)
})

describe('AdminMemberPage (#254)', () => {
  it('heads the page with the member, their email, balance and a link to their public profile', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Ben' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('href', '/admin/members')
    expect(screen.getByText(/ben@example\.com/)).toHaveTextContent('ben@example.com · Joined')
    expect(screen.getByText('60 DC')).toBeInTheDocument()
    expect(screen.getByText('Reviewer', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Public profile' })).toHaveAttribute('href', `/members/${ID}`)
    expect(screen.getByRole('link', { name: 'Open in Ledger' })).toHaveAttribute('href', `/admin/ledger?member=${ID}`)
  })

  it('gives the owner the balance, role and access controls', async () => {
    await renderPage()
    expect(within(screen.getByRole('region', { name: 'Adjust balance' })).getByRole('button', { name: 'Adjust Ben' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Role' })).getByLabelText('Role')).toHaveValue('reviewer')
    expect(within(screen.getByRole('region', { name: 'Access' })).getByRole('button', { name: 'Remove Ben from DwellDuel' })).toBeInTheDocument()
  })

  it('shows an admin who’s who, and none of the owner’s controls', async () => {
    role.current = 'admin'
    await renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Ben' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Adjust balance' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Role' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Access' })).toBeNull()
  })

  it('never offers to remove, or change the role of, the owner', async () => {
    getAdminMember.mockResolvedValue({ ...BEN, role: 'owner' })
    await renderPage()
    expect(screen.queryByRole('region', { name: 'Role' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Access' })).toBeNull()
  })

  // #265
  it('offers a removed member Invite again in place of Remove, and no role', async () => {
    getAdminMember.mockResolvedValue({ ...BEN, role: 'member', removed: true })
    await renderPage()
    expect(screen.getByText('Removed')).toBeInTheDocument()
    const access = screen.getByRole('region', { name: 'Access' })
    expect(within(access).getByRole('button', { name: 'Invite Ben again' })).toBeInTheDocument()
    expect(within(access).queryByRole('button', { name: /Remove/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Role' })).toBeNull()
  })

  it('is a real 404 for an unknown or malformed id', async () => {
    getAdminMember.mockResolvedValue(null)
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(renderPage('not-a-uuid')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('sends a reviewer to the approval queue and a member home', async () => {
    role.current = 'reviewer'
    await expect(renderPage()).rejects.toThrow('NEXT_REDIRECT /admin/tasks')
    role.current = 'member'
    await expect(renderPage()).rejects.toThrow('NEXT_REDIRECT /')
  })
})
