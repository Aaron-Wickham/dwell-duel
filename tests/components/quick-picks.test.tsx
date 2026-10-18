// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { SlipProvider } from '@/components/slip/slip-provider'
import { QuickPicks, type QuickPick } from '@/components/markets/quick-picks'
import { EMPTY_SLIP, type SlipPick } from '@/lib/parlays/get-slip'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/parlays/slip-actions', () => ({ setPickModeAction: vi.fn() }))

function pickOf(label: string, index: number): SlipPick {
  return {
    outcomeId: `o-${index}`,
    outcomeLabel: label,
    marketId: 'm-1',
    marketTitle: 'Who will sleep the most?',
    parlay: false,
    open: true,
    lmsr: { q: [0, 0, 0, 0, 0, 0], index, liquidity: 50 },
  }
}

const quick = (label: string, index: number, pct: number, tone: QuickPick['tone'] = null): QuickPick => ({
  pick: pickOf(label, index),
  pct,
  series: tone === null ? (1 as const) : null,
  tone,
  addAction: vi.fn(),
  removeAction: vi.fn(),
})

const SIX = ['Alex', 'Emma', 'Sam', 'Ruth', 'Ben', 'Eli'].map((name, i) => quick(name, i, [69, 17, 8, 3, 2, 1][i]))

describe('QuickPicks (#439)', () => {
  it('lists every outcome of a multiple-choice market, each with an Add pill and no "more" count', () => {
    render(
      <SlipProvider view={EMPTY_SLIP}>
        <QuickPicks picks={SIX} />
      </SlipProvider>,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(6)
    for (const b of buttons) expect(within(b).getByText('Add')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Eli at 1% to slip' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(/more$/)).toBeNull()
  })

  it('says In slip on a pick already in the slip', () => {
    render(
      <SlipProvider view={{ ...EMPTY_SLIP, picks: [SIX[0].pick] }}>
        <QuickPicks picks={SIX} />
      </SlipProvider>,
    )
    const alex = screen.getByRole('button', { name: 'Remove Alex from slip' })
    expect(alex).toHaveAttribute('aria-pressed', 'true')
    expect(within(alex).getByText('In slip')).toBeInTheDocument()
  })

  it('holds the card still while the pointer is on a pick, so only the pick reacts', () => {
    const { container } = render(
      <SlipProvider view={EMPTY_SLIP}>
        <QuickPicks picks={[quick('Yes', 0, 52, 'yes'), quick('No', 1, 48, 'no')]} />
      </SlipProvider>,
    )
    expect(container.querySelector('[data-own-hover]')).not.toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})
