// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/markets',
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

const { listAwaitingMarkets } = vi.hoisted(() => ({ listAwaitingMarkets: vi.fn() }))
vi.mock('@/lib/admin/markets-awaiting', () => ({ listAwaitingMarkets }))

import AdminMarketsPage from '@/app/(app)/admin/markets/page'

const MARKET = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Will it snow before Thanksgiving?',
  closeAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  creatorId: '00000000-0000-4000-8000-0000000000aa',
  creatorName: 'Dawit',
  pooled: 140,
}

describe('AdminMarketsPage', () => {
  it('lists each waiting market with its pool, creator and a Resolve link to its resolve form', async () => {
    listAwaitingMarkets.mockResolvedValue({ rows: [MARKET], next: null, windowed: false })
    render(await AdminMarketsPage({ searchParams: Promise.resolve({}) } as never))

    const section = screen.getByRole('region', { name: 'Waiting to be resolved' })
    const row = within(section).getByRole('listitem')
    expect(within(row).getByRole('link', { name: MARKET.title })).toHaveAttribute('href', `/markets/${MARKET.id}`)
    expect(within(row).getByRole('link', { name: `Resolve ${MARKET.title}` })).toHaveAttribute(
      'href',
      `/markets/${MARKET.id}#manage-title`,
    )
    expect(within(row).getByRole('link', { name: 'Dawit' })).toHaveAttribute('href', `/members/${MARKET.creatorId}`)
    expect(row).toHaveTextContent('140 DC in the pool')
    expect(row).toHaveTextContent('2d ago')
  })

  it('shows the empty state when nothing is waiting', async () => {
    listAwaitingMarkets.mockResolvedValue({ rows: [], next: null, windowed: false })
    render(await AdminMarketsPage({ searchParams: Promise.resolve({}) } as never))
    expect(screen.getByText('Nothing to resolve.')).toBeInTheDocument()
  })

  it('shows "Nothing older here" instead of the empty state for an empty fresh window', async () => {
    listAwaitingMarkets.mockResolvedValue({ rows: [], next: null, windowed: true })
    render(await AdminMarketsPage({ searchParams: Promise.resolve({ after_from: 'abc' }) } as never))
    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing to resolve.')).not.toBeInTheDocument()
  })
})
