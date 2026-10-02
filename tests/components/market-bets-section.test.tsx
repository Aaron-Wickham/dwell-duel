// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { KeysetPage } from '@/lib/pagination/keyset'
import type { MarketBet, MarketDetail } from '@/lib/markets/get-market'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

const { getMarketBets, requestShowMoreFocus } = vi.hoisted(() => ({
  getMarketBets: vi.fn(),
  requestShowMoreFocus: vi.fn(),
}))
vi.mock('@/lib/markets/get-market', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getMarketBets,
}))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase: {}, user: { id: 'p-me' } }) }))
vi.mock('@/lib/auth/roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/roles')>()),
  getRole: async () => 'member',
}))
vi.mock('@/components/ui/show-more-focus', () => ({ ShowMoreFocus: () => null, requestShowMoreFocus }))
// A plain click runs onNavigate, as the App Router's Link does for a client-side navigation.
vi.mock('next/link', () => ({
  default: ({
    href,
    scroll,
    replace: _replace,
    transitionTypes: _transitionTypes,
    onNavigate,
    ...props
  }: ComponentProps<'a'> & { href: string; scroll?: boolean; replace?: boolean; transitionTypes?: string[]; onNavigate?: () => void }) => (
    <a
      href={href}
      data-scroll={String(scroll ?? true)}
      onClick={(event) => {
        event.preventDefault()
        onNavigate?.()
      }}
      {...props}
    />
  ),
}))

// MarketBets is the async Server Component the market page streams behind a <Suspense>; jsdom
// can't render an async component in place there, so it's exercised directly, the same way the
// market page renders it once its own promise resolves.
import { MarketBets } from '@/app/(app)/markets/[id]/market-bets'

const market: MarketDetail = {
  id: 'm-1',
  title: 'Social layer market',
  description: null,
  kind: 'binary',
  status: 'open',
  closeAt: '2026-10-01T00:00:00Z',
  createdAt: '2026-09-20T09:00:00Z',
  seedPerOutcome: 20,
  pricing: 'pool',
  liquidity: 50,
  line: null,
  actualValue: null,
  editedAt: null,
  category: null,
  createdBy: 'p-owner',
  creatorName: 'Owner',
  currentResolutionId: null,
  resolvedOutcomeId: null,
  resolvedOutcomeLabel: null,
  resolvedAt: null,
  payoutSeed: 0,
  settledAt: null,
  voidReason: null,
  outcomes: [
    { id: 'o-yes', label: 'Yes', poolTotal: 10, shares: 0, qOffset: 0 },
    { id: 'o-no', label: 'No', poolTotal: 5, shares: 0, qOffset: 0 },
  ],
}

const bet = (id: number): MarketBet => ({
  id,
  outcomeId: 'o-yes',
  amount: 5,
  createdAt: '2026-09-25T09:00:00Z',
  profileId: 'p-alice',
  bettorName: 'Alice',
  bettorAvatarSrc: null,
})

async function renderBets(betsPage: KeysetPage<MarketBet>, searchParams: Record<string, string> = {}) {
  getMarketBets.mockResolvedValue(betsPage)
  render(
    await MarketBets({
      market,
      viewerId: 'p-me',
      canBet: true,
      page: { before: null, before_from: null },
      searchParams,
    } as never),
  )
}

beforeEach(() => {
  getMarketBets.mockReset()
  requestShowMoreFocus.mockReset()
})

describe('MarketBets', () => {
  it('says there is nothing older, not that there are no bets, for a window past the end', async () => {
    await renderBets({ rows: [], next: null, windowed: true }, { bets_from: 'OLD' })
    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to newest' })).toHaveAttribute('href', '/markets/m-1')
    expect(screen.queryByText('No bets yet.')).toBeNull()
  })

  it('keeps its own empty state when the market has no bets', async () => {
    await renderBets({ rows: [], next: null, windowed: false })
    expect(screen.getByText('No bets yet.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing older here.')).toBeNull()
  })

  it('moves focus to the first new bet when Show more is clicked', async () => {
    await renderBets({
      rows: [bet(1)],
      next: { kind: 'extend', cursor: 'NEXT', firstId: '2' },
      windowed: false,
    })
    const showMore = screen.getByRole('link', { name: 'Show more' })
    expect(showMore).toHaveAttribute('href', '/markets/m-1?bets=NEXT')

    fireEvent.click(showMore)
    expect(requestShowMoreFocus).toHaveBeenCalledWith('bet-2')
  })
})
