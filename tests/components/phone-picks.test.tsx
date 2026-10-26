// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { MarketDetail } from '@/lib/markets/get-market'
import type { OutcomeOdds } from '@/lib/markets/odds'
import { EMPTY_SLIP } from '@/lib/parlays/get-slip'
import { MAX_SLIP_PICKS, SLIP_FULL_MESSAGE } from '@/lib/parlays/parse-slip'

vi.mock('@/lib/parlays/slip-actions', () => ({
  addToSlipAction: vi.fn(),
  removeFromSlipAction: vi.fn(),
  setPickModeAction: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { PhonePicks } from '@/components/markets/phone-picks'
import { SlipProvider } from '@/components/slip/slip-provider'

const binary: MarketDetail = {
  id: 'm-1',
  title: 'Will it rain on the picnic?',
  description: null,
  kind: 'binary',
  status: 'open',
  closeAt: '2099-10-04T09:00:00Z',
  createdAt: '2026-09-20T09:00:00Z',
  seedPerOutcome: 0,
  pricing: 'lmsr',
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
    { id: 'o-yes', label: 'Yes', poolTotal: 0, shares: 0, qOffset: 0 },
    { id: 'o-no', label: 'No', poolTotal: 0, shares: 0, qOffset: 0 },
  ],
}

const oddsOf = (chances: [string, string, number][]): OutcomeOdds[] =>
  chances.map(([outcomeId, label, impliedProbability]) => ({ outcomeId, label, poolTotal: 0, impliedProbability }))

const NAMES = ['Alex', 'Emma', 'Sam', 'Ruth', 'Ben']
const multiple: MarketDetail = {
  ...binary,
  kind: 'multiple_choice',
  title: 'Who sleeps most?',
  outcomes: NAMES.map((label, i) => ({ id: `o-${i}`, label, poolTotal: 0, shares: 0, qOffset: 0 })),
}
const multipleOdds = oddsOf(NAMES.map((label, i) => [`o-${i}`, label, [0.1, 0.4, 0.05, 0.3, 0.15][i]]))

function renderBlock(market: MarketDetail, odds: OutcomeOdds[], slip: string[] = []) {
  return render(
    <SlipProvider view={EMPTY_SLIP}>
      <PhonePicks market={market} odds={odds} slip={slip} />
    </SlipProvider>,
  )
}

describe('PhonePicks (D-4)', () => {
  it('shows both sides of a two-outcome market on a phone only, with no See all link', () => {
    renderBlock(binary, oddsOf([['o-yes', 'Yes', 0.6], ['o-no', 'No', 0.4]]))
    const block = screen.getByRole('region', { name: 'Add a pick' })
    expect(block).toHaveClass('lg:hidden')
    expect(within(block).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Yes, 60%, Will it rain on the picnic?',
      'No, 40%, Will it rain on the picnic?',
    ])
    expect(within(block).queryByRole('link')).toBeNull()
  })

  it('shows a multiple-choice market’s three likeliest, then links to every outcome', () => {
    renderBlock(multiple, multipleOdds)
    const block = screen.getByRole('region', { name: 'Add a pick' })
    expect(within(block).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Emma, 40%, Who sleeps most?',
      'Ruth, 30%, Who sleeps most?',
      'Ben, 15%, Who sleeps most?',
    ])
    expect(within(block).getByRole('link', { name: 'See all 5 outcomes' })).toHaveAttribute('href', '#outcomes-title')
  })

  it('holds the picks back with a note while the slip is full of other markets’ picks', () => {
    const full = Array.from({ length: MAX_SLIP_PICKS }, (_, i) => `other-${i}`)
    renderBlock(binary, oddsOf([['o-yes', 'Yes', 0.5], ['o-no', 'No', 0.5]]), full)
    const note = screen.getByText(SLIP_FULL_MESSAGE)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription(SLIP_FULL_MESSAGE)
    }
    expect(note).toBeInTheDocument()
  })

  it('still takes a pick from a market already in a full slip, which replaces its pick', () => {
    const full = ['o-yes', ...Array.from({ length: MAX_SLIP_PICKS - 1 }, (_, i) => `other-${i}`)]
    renderBlock(binary, oddsOf([['o-yes', 'Yes', 0.5], ['o-no', 'No', 0.5]]), full)
    expect(screen.queryByText(SLIP_FULL_MESSAGE)).toBeNull()
    for (const button of screen.getAllByRole('button')) expect(button).toBeEnabled()
  })
})
