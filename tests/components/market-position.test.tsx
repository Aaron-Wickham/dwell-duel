// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { MarketDetail } from '@/lib/markets/get-market'
import type { MarketPosition as Position, PositionBet } from '@/lib/markets/position'
import type { ParlayView } from '@/lib/parlays/list-parlays'
import { EMPTY_SLIP } from '@/lib/parlays/get-slip'
import { lmsrState } from '@/lib/markets/pricing'
import type { ResolutionProof } from '@/lib/markets/resolution-proof'
import { soloPays } from '@/lib/parlays/solo-pays'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

const { getMarketPosition, getParlayRiding } = vi.hoisted(() => ({
  getMarketPosition: vi.fn(),
  getParlayRiding: vi.fn(),
}))
vi.mock('@/lib/markets/position', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getMarketPosition,
}))
vi.mock('@/lib/markets/parlay-riding', () => ({ getParlayRiding }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase: {}, user: { id: 'p-me' } }) }))
vi.mock('@/lib/parlays/slip-actions', () => ({
  addToSlipAction: vi.fn(),
  removeFromSlipAction: vi.fn(),
  setPickModeAction: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('next/link', () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, transitionTypes: _t, ...props }: ComponentProps<'a'> & { href: string; transitionTypes?: string[] }) => (
    <a href={href} {...props} />
  ),
}))

import { PositionCard } from '@/components/markets/position-card'
import { MarketPosition } from '@/app/(app)/markets/[id]/market-position'
import { MarketOutcomes } from '@/app/(app)/markets/[id]/market-outcomes'
import { SlipProvider } from '@/components/slip/slip-provider'

const market: MarketDetail = {
  id: 'm-1',
  title: 'Will it rain on the picnic?',
  description: null,
  kind: 'binary',
  status: 'open',
  closeAt: '2026-10-04T09:00:00Z',
  createdAt: '2026-09-20T09:00:00Z',
  seedPerOutcome: 20,
  pricing: 'pool',
  liquidity: 50,
  line: null,
  actualValue: null,
  editedAt: null,
  category: null,
  createdBy: 'p-owner',
  creatorName: 'Mia',
  currentResolutionId: null,
  resolvedOutcomeId: null,
  resolvedOutcomeLabel: null,
  resolvedAt: null,
  payoutSeed: 0,
  settledAt: null,
  voidReason: null,
  outcomes: [
    { id: 'o-yes', label: 'Yes', poolTotal: 60, shares: 0, qOffset: 0 },
    { id: 'o-no', label: 'No', poolTotal: 20, shares: 0, qOffset: 0 },
  ],
}

const solo = (id: number, amount: number, outcomeLabel: string, result: PositionBet['result'], paysIfWins: number | null): PositionBet => ({
  id,
  outcomeLabel,
  amount,
  placedAt: '2026-10-03T09:14:00Z',
  result,
  paysIfWins,
})

const parlay = (overrides: Partial<ParlayView> = {}): ParlayView => ({
  id: 'p-123',
  stake: 5,
  status: 'pending',
  credited: 0,
  maxMultiplier: 20,
  lockedAtPlacement: false,
  converted: false,
  fixed: false,
  multiplierBp: 160_000,
  capped: false,
  estimated: true,
  potentialPayout: 80,
  createdAt: '2026-10-03T09:00:00Z',
  legs: [
    { marketId: 'm-1', marketTitle: 'Will it rain on the picnic?', outcomeLabel: 'Yes', oddsBp: 13_333, oddsKnown: false, status: 'open' },
    { marketId: 'm-2', marketTitle: 'Other', outcomeLabel: 'No', oddsBp: 20_000, oddsKnown: false, status: 'open' },
    { marketId: 'm-3', marketTitle: 'Third', outcomeLabel: 'Yes', oddsBp: 20_000, oddsKnown: false, status: 'open' },
  ],
  ...overrides,
})

const withLeg = (p: ParlayView) => ({ parlay: p, leg: p.legs[0] })

beforeEach(() => {
  getMarketPosition.mockReset()
  getParlayRiding.mockReset()
})

describe('PositionCard, while the market is open', () => {
  const open: Position = {
    bets: [solo(1, 20, 'Yes', { kind: 'open' }, 26), solo(2, 10, 'No', { kind: 'open' }, 31)],
    legs: [withLeg(parlay())],
  }

  it('lists each bet separately with what it pays, and no Cancel', () => {
    render(<PositionCard position={open} resolvedAt={null} />)
    const card = screen.getByRole('region', { name: 'Your position' })
    expect(card).toHaveClass('border-2', 'border-ink')
    expect(within(card).getByText('30 DC on this market · Bets are final.')).toBeInTheDocument()

    const rows = within(card).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('20 DC on Yes')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Pays 26 DC')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Pays 31 DC')).toBeInTheDocument()
    expect(within(card).queryByRole('button')).toBeNull()
  })

  it('shows a parlay leg with its pill and a link to the parlay', () => {
    render(<PositionCard position={open} resolvedAt={null} />)
    const row = screen.getByText('Parlay leg: Yes').closest('li')!
    expect(
      within(row).getByText('5 DC · 3 picks · pays ~80 DC if every pick wins. Leg odds are set when this market closes.'),
    ).toBeInTheDocument()
    expect(within(row).getByText('Open')).toBeInTheDocument()
    const link = within(row).getByRole('link', { name: /^View parlay/ })
    expect(link).toHaveAttribute('href', '/parlays/p-123')
    expect(link).toHaveClass('pressable', 'hit-area')
    expect(within(row).queryByRole('button')).toBeNull()
  })

  it('has no summary line for a viewer with only parlay legs', () => {
    render(<PositionCard position={{ bets: [], legs: [withLeg(parlay())] }} resolvedAt={null} />)
    expect(screen.queryByText(/on this market/)).toBeNull()
  })
})

describe('PositionCard, once settled', () => {
  it('shows each bet’s result and the net, with no Cancel or Pays ~', () => {
    const won = parlay({
      status: 'pending',
      estimated: false,
      legs: [
        { marketId: 'm-1', marketTitle: 'Will it rain?', outcomeLabel: 'Yes', oddsBp: 13_333, oddsKnown: true, status: 'won' },
        { marketId: 'm-2', marketTitle: 'Other', outcomeLabel: 'No', oddsBp: 20_000, oddsKnown: false, status: 'open' },
        { marketId: 'm-3', marketTitle: 'Third', outcomeLabel: 'Yes', oddsBp: 20_000, oddsKnown: false, status: 'open' },
      ],
    })
    render(
      <PositionCard
        position={{
          bets: [solo(1, 20, 'Yes', { kind: 'won', payout: 36 }, null), solo(2, 10, 'No', { kind: 'lost' }, null)],
          legs: [withLeg(won)],
        }}
        resolvedAt="2026-09-21T15:00:00Z"
      />,
    )
    expect(screen.getByText('You won 6 DC on this market.')).toHaveClass('text-win')
    expect(screen.getByText('Won 36 DC')).toBeInTheDocument()
    expect(screen.getByText('Lost')).toBeInTheDocument()
    expect(screen.getByText(/^Paid/)).toBeInTheDocument()
    expect(screen.getByText('Your leg won. The parlay waits on 2 more picks.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/Pays ~/)).toBeNull()
  })

  it('hides the net line when it comes to 0', () => {
    render(
      <PositionCard
        position={{ bets: [solo(1, 20, 'Yes', { kind: 'won', payout: 30 }, null), solo(2, 10, 'No', { kind: 'lost' }, null)], legs: [] }}
        resolvedAt="2026-09-21T15:00:00Z"
      />,
    )
    expect(screen.queryByText(/You (won|lost)/)).toBeNull()
  })

  it('says the bets were refunded on a voided market', () => {
    render(
      <PositionCard position={{ bets: [solo(1, 20, 'Yes', { kind: 'refunded', reason: 'voided' }, null)], legs: [] }} resolvedAt={null} />,
    )
    expect(screen.getByText('Your bet was refunded.')).toBeInTheDocument()
    expect(screen.getByText('Refunded')).toBeInTheDocument()
  })
})

describe('MarketPosition', () => {
  it('renders nothing when every bet it was told about has gone', async () => {
    getMarketPosition.mockResolvedValue({ bets: [], legs: [] })
    const element = await MarketPosition({ market, keys: { betIds: [1], parlayIds: [] }, now: Date.now() })
    expect(element).toBeNull()
  })

  // Its place on the page (the rail from lg, after the chart on a phone) is its wrapper's, in page.tsx.
  it('carries no grid placement of its own', async () => {
    getMarketPosition.mockResolvedValue({ bets: [solo(1, 20, 'Yes', { kind: 'open' }, 26)], legs: [] })
    render((await MarketPosition({ market, keys: { betIds: [1], parlayIds: [] }, now: Date.now() }))!)
    expect(screen.getByRole('region', { name: 'Your position' }).className).not.toMatch(/lg:(col|row)-/)
  })
})

describe('MarketOutcomes', () => {
  // Yes has sold 20 shares, so its payout differs from No's.
  const lmsrMarket: MarketDetail = {
    ...market,
    pricing: 'lmsr',
    outcomes: [
      { id: 'o-yes', label: 'Yes', poolTotal: 60, shares: 20, qOffset: 0 },
      { id: 'o-no', label: 'No', poolTotal: 20, shares: 0, qOffset: 0 },
    ],
  }
  const odds = [
    { outcomeId: 'o-yes', label: 'Yes', poolTotal: 60, impliedProbability: 0.75 },
    { outcomeId: 'o-no', label: 'No', poolTotal: 20, impliedProbability: 0.25 },
  ]

  async function renderOutcomes(
    riding: Map<string, number>,
    overrides: Partial<MarketDetail> = {},
    { canBet = (overrides.status ?? 'open') === 'open', resolution = null }: { canBet?: boolean; resolution?: ResolutionProof | null } = {},
  ) {
    getParlayRiding.mockResolvedValue(riding)
    render(
      <SlipProvider view={EMPTY_SLIP}>
        {await MarketOutcomes({ market: { ...lmsrMarket, ...overrides }, odds, slip: [], canBet, resolution })}
      </SlipProvider>,
    )
    return screen.getByRole('region', { name: 'Outcomes' })
  }

  it('shows each outcome’s chance alone, and what 10 DC on it wins, exactly as the slip would', async () => {
    const card = await renderOutcomes(new Map())
    const q = lmsrState(lmsrMarket.outcomes)
    const yesPays = soloPays({ q, index: 0, liquidity: lmsrMarket.liquidity }, 10)
    expect(within(card).getByText('75%', { selector: '.sr-only' })).toBeInTheDocument()
    expect(within(card).getByText(`10 DC wins ${yesPays}`, { selector: '.sr-only' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Add Yes to slip' })).toBeInTheDocument()
    expect(within(card).queryByText(/payout per DC|in the pool|DC bet/)).toBeNull()
  })

  it('says once, under the rows, how much parlay money rides on the market (#279)', async () => {
    const card = await renderOutcomes(new Map([['o-yes', 45], ['o-no', 15]]))
    expect(within(card).getByText(/^Includes 60 DC riding in parlays\./)).toBeInTheDocument()
    expect(within(card).queryByText(/\+45 DC/)).toBeNull()
    expect(within(card).queryByText(/bought shares here/)).toBeNull()
    expect(within(card).getByRole('link', { name: 'How parlays pay' })).toHaveAttribute(
      'href',
      '/how-it-works/rules#how-the-slip-solo-bets-and-parlays',
    )
  })

  it('shows no parlay line when no pending parlay rides on the market', async () => {
    await renderOutcomes(new Map())
    expect(screen.queryByText(/riding in parlays/)).toBeNull()
  })

  // A voided market's legs dropped out of their parlays, though parlay_legs still names them.
  it('says the market was voided and what happened to stakes, with no parlay line, and doesn’t ask', async () => {
    const card = await renderOutcomes(new Map([['o-yes', 45]]), { status: 'voided', voidReason: 'The picnic moved.' })
    expect(within(card).getByText('This market was voided. Every bet was refunded, and parlays dropped this pick.')).toBeInTheDocument()
    expect(within(card).getByRole('region', { name: 'Why it was voided' })).toHaveTextContent('The picnic moved.')
    expect(screen.queryByText(/riding in parlays/)).toBeNull()
    expect(getParlayRiding).not.toHaveBeenCalled()
  })

  it('states a result once, marks the winner, and offers no Add', async () => {
    const card = await renderOutcomes(new Map(), { status: 'resolved', resolvedOutcomeLabel: 'Yes', resolvedOutcomeId: 'o-yes' }, {
      resolution: { note: 'It poured.', proof: [], previous: null },
    })
    expect(within(card).getAllByText(/Yes won/)).toHaveLength(1)
    expect(within(card).getByText('Won')).toBeInTheDocument()
    expect(within(card).getByRole('region', { name: 'Why it resolved this way' })).toHaveTextContent('It poured.')
    expect(within(card).queryByRole('button')).toBeNull()
    expect(within(card).queryByText(/wins \d/)).toBeNull()
  })

  it('says a closed market is waiting for its result', async () => {
    const card = await renderOutcomes(new Map(), {}, { canBet: false })
    expect(within(card).getByText('Betting has closed. Waiting for a result.')).toBeInTheDocument()
    expect(within(card).queryByRole('button')).toBeNull()
  })
})
