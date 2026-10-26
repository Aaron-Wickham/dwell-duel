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

const quick = (label: string, index: number, pct: number, twoOutcome = false): QuickPick => ({
  pick: pickOf(label, index),
  pct,
  series: twoOutcome ? null : (1 as const),
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
    expect(screen.getByRole('button', { name: 'Eli, 1%, Who will sleep the most?' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(/more$/)).toBeNull()
  })

  it('says In slip on a pick already in the slip', () => {
    render(
      <SlipProvider view={{ ...EMPTY_SLIP, picks: [SIX[0].pick] }}>
        <QuickPicks picks={SIX} />
      </SlipProvider>,
    )
    // MKT-8: the same name in and out of the slip; aria-pressed carries the difference.
    const alex = screen.getByRole('button', { name: 'Alex, 69%, Who will sleep the most?' })
    expect(alex).toHaveAttribute('aria-pressed', 'true')
    expect(within(alex).getByText('In slip')).toBeInTheDocument()
  })

  it('holds the card still while the pointer is on a pick, so only the pick reacts', () => {
    const { container } = render(
      <SlipProvider view={EMPTY_SLIP}>
        <QuickPicks picks={[quick('Yes', 0, 52, true), quick('No', 1, 48, true)]} />
      </SlipProvider>,
    )
    expect(container.querySelector('[data-own-hover]')).not.toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('gives both sides of a two-outcome market the same neutral look (D-3)', () => {
    render(
      <SlipProvider view={EMPTY_SLIP}>
        <QuickPicks picks={[quick('Over 42.5', 0, 50, true), quick('Under 42.5', 1, 50, true)]} />
      </SlipProvider>,
    )
    const [over, under] = screen.getAllByRole('button')
    expect(over.className).toBe(under.className)
    expect(under).not.toHaveClass('text-loss')
    expect(under).not.toHaveClass('bg-loss-soft')
  })

  it('never truncates the chance, only the label (MKT-1)', () => {
    render(
      <SlipProvider view={EMPTY_SLIP}>
        <QuickPicks picks={[quick('Over 42.5', 0, 50, true), quick('Under 42.5', 1, 50, true)]} />
      </SlipProvider>,
    )
    const over = screen.getByRole('button', { name: 'Over 42.5, 50%, Who will sleep the most?' })
    expect(within(over).getByText('Over 42.5')).toHaveClass('truncate')
    expect(within(over).getByText('50%')).toHaveClass('shrink-0')
    expect(within(over).getByText('50%')).not.toHaveClass('truncate')
  })
})
