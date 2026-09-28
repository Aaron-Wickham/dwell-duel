// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SlipPick, SlipView } from '@/lib/parlays/get-slip'

vi.mock('@/lib/parlays/place-slip', () => ({ placeSlipAction: vi.fn() }))
vi.mock('@/lib/parlays/slip-actions', () => ({ setPickModeAction: vi.fn(), removeFromSlipAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import { SlipProvider } from '@/components/slip/slip-provider'
import { SlipSheet } from '@/components/slip/slip-sheet'

const pick: SlipPick = {
  outcomeId: '00000001-0000-4000-8000-000000000000',
  outcomeLabel: 'Yes',
  marketId: 'm1',
  marketTitle: 'Will it rain?',
  parlay: false,
  open: true,
  oddsBp: 20_000,
  outcomePool: 10,
  totalPool: 20,
}
const viewOf = (...picks: SlipPick[]): SlipView => ({ picks, legBps: [], multiplierBp: 10_000, capped: false })

beforeAll(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

describe('SlipSheet', () => {
  it('shows nothing while the slip is empty', () => {
    const { container } = render(
      <SlipProvider view={viewOf()}>
        <SlipSheet />
      </SlipProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the pick count on its button straight away, before the drawer has loaded', () => {
    render(
      <SlipProvider view={viewOf(pick)}>
        <SlipSheet />
      </SlipProvider>,
    )
    const trigger = screen.getByRole('button', { name: 'Slip (1)' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('loads and opens the slip on a tap, and hands focus back to the button on Escape', async () => {
    const user = userEvent.setup()
    render(
      <SlipProvider view={viewOf(pick)}>
        <SlipSheet />
      </SlipProvider>,
    )
    const trigger = screen.getByRole('button', { name: 'Slip (1)' })
    await user.click(trigger)
    expect(await screen.findByRole('dialog', { name: 'Your slip' })).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })
})
