// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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
const { listCategoryCounts } = vi.hoisted(() => ({ listCategoryCounts: vi.fn() }))
vi.mock('@/lib/markets/categories', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/markets/categories')>()),
  listCategoryCounts,
}))
const { mergeCategoryAction, renameCategoryAction, setCategoryHiddenAction } = vi.hoisted(() => ({
  mergeCategoryAction: vi.fn(),
  renameCategoryAction: vi.fn(),
  setCategoryHiddenAction: vi.fn(),
}))
vi.mock('@/lib/admin/category-actions', () => ({ mergeCategoryAction, renameCategoryAction, setCategoryHiddenAction }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

const OTHER = { id: '00000000-0000-4000-8000-000000000327', name: 'Other', slug: 'other', hiddenAt: null, openMarkets: 0, markets: 3 }
const FOOTY = { id: 'c-footy', name: 'Footy', slug: 'footy', hiddenAt: null, openMarkets: 1, markets: 2 }
const SPORTS = { id: 'c-sports', name: 'Sports', slug: 'sports', hiddenAt: null, openMarkets: 4, markets: 9 }
const OLD = { id: 'c-old', name: 'Old', slug: 'old', hiddenAt: '2026-09-01T00:00:00Z', openMarkets: 0, markets: 1 }

import AdminMarketsPage from '@/app/(app)/admin/(sections)/markets/page'

const MARKET = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Will it snow before Thanksgiving?',
  closeAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  creatorId: '00000000-0000-4000-8000-0000000000aa',
  creatorName: 'Dawit',
  pooled: 140,
}

describe('AdminMarketsPage', () => {
  beforeEach(() => listCategoryCounts.mockResolvedValue([SPORTS, OLD, FOOTY, OTHER]))
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

  it('lists every category as a card, the hidden ones last, and never offers to hide or merge Other (#327)', async () => {
    listAwaitingMarkets.mockResolvedValue({ rows: [], next: null, windowed: false })
    render(await AdminMarketsPage({ searchParams: Promise.resolve({}) } as never))
    expect(listCategoryCounts).toHaveBeenCalledWith({}, true)

    const section = screen.getByRole('region', { name: 'Categories' })
    const cards = within(section).getAllByRole('listitem')
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual(['Sports', 'Footy', 'Other', 'Old'])
    expect(cards[0]).toHaveTextContent('9 markets · 4 taking bets')
    expect(within(cards[3]).getByText('Hidden')).toBeInTheDocument()
    expect(within(cards[3]).getByRole('button', { name: 'Unhide Old' })).toBeInTheDocument()
    expect(within(cards[2]).getByRole('button', { name: 'Rename Other' })).toBeInTheDocument()
    expect(within(cards[2]).queryByRole('button', { name: /Hide|Merge/ })).toBeNull()
  })

  it('merges only after confirming, into a visible category', async () => {
    mergeCategoryAction.mockResolvedValue({ saved: true })
    listAwaitingMarkets.mockResolvedValue({ rows: [], next: null, windowed: false })
    render(await AdminMarketsPage({ searchParams: Promise.resolve({}) } as never))
    const footy = within(screen.getByRole('region', { name: 'Categories' })).getAllByRole('listitem')[1]

    await userEvent.click(within(footy).getByRole('button', { name: 'Merge Footy' }))
    const into = within(footy).getByLabelText('Merge Footy into')
    expect([...(into as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Sports', 'Other'])
    await userEvent.click(within(footy).getByRole('button', { name: 'Merge' }))
    expect(mergeCategoryAction).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('alertdialog', { name: 'Merge Footy into Sports?' })
    expect(dialog).toHaveTextContent('2 markets move from Footy to Sports, and Footy is hidden.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Merge' }))
    await waitFor(() => expect(mergeCategoryAction).toHaveBeenCalled())
    expect(mergeCategoryAction.mock.calls[0][0]).toBe('c-footy')
    expect((mergeCategoryAction.mock.calls[0][2] as FormData).get('into')).toBe('c-sports')
  })

  it('renames, keeping what was typed when the name is taken', async () => {
    renameCategoryAction.mockResolvedValue({ formError: 'A category with that name already exists. Merge them instead.' })
    listAwaitingMarkets.mockResolvedValue({ rows: [], next: null, windowed: false })
    render(await AdminMarketsPage({ searchParams: Promise.resolve({}) } as never))
    const footy = within(screen.getByRole('region', { name: 'Categories' })).getAllByRole('listitem')[1]

    await userEvent.click(within(footy).getByRole('button', { name: 'Rename Footy' }))
    const name = within(footy).getByLabelText('New name')
    expect(name).toHaveAttribute('maxLength', '24')
    await userEvent.clear(name)
    await userEvent.type(name, 'Sports')
    await userEvent.click(within(footy).getByRole('button', { name: 'Save name' }))
    await within(footy).findByText('A category with that name already exists. Merge them instead.')
    expect(within(footy).getByLabelText('New name')).toHaveValue('Sports')
    expect(within(footy).getByLabelText('New name')).toHaveAttribute('aria-invalid', 'true')
  })
})
