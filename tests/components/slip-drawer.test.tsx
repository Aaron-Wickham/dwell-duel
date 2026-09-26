// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import type { SlipPick as SlipPickView, SlipView } from '@/lib/parlays/get-slip'
import { combineOdds } from '@/lib/parlays/odds'

vi.mock('@number-flow/react', () => ({
  default: ({ value, suffix }: { value: number; suffix?: string }) => `${value}${suffix ?? ''}`,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

const { placeParlayAction } = vi.hoisted(() => ({ placeParlayAction: vi.fn() }))
vi.mock('@/lib/parlays/place-parlay', () => ({ placeParlayAction }))
vi.mock('@/lib/parlays/slip-actions', () => ({ removeFromSlipAction: vi.fn() }))

import { SlipCountProvider } from '@/components/app-nav/slip-count'
import { SlipDrawer } from '@/app/(app)/markets/[id]/slip-drawer'

function pick(n: number): SlipPickView {
  return { outcomeId: `o${n}`, outcomeLabel: 'Yes', marketId: `m${n}`, marketTitle: `Market ${n}?`, oddsBp: 40_000, available: true }
}

function slipView(picks: SlipPickView[]): SlipView {
  const legBps = picks.flatMap((p) => (p.oddsBp !== null ? [p.oddsBp] : []))
  return { picks, legBps, ...combineOdds(legBps), canPlace: picks.length >= 2 }
}

// The trigger's label now follows the nav's slip count (see slip-drawer.tsx), so every render
// needs a provider. Its count defaults to the slip's own length, matching the layout in prod.
function withSlip(slip: SlipView, badgeCount = slip.picks.length, extra: ReactElement | null = null) {
  return (
    <SlipCountProvider initial={badgeCount}>
      {extra}
      <SlipDrawer slip={slip} />
    </SlipCountProvider>
  )
}

beforeEach(() => {
  placeParlayAction.mockReset()
})

describe('SlipDrawer', () => {
  it('renders nothing while the slip is empty', () => {
    const { container } = render(<SlipDrawer slip={slipView([])} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: /^Slip/ })).toBeNull()
  })

  it('shows a phone-only "Slip (n)" trigger and mounts no slip content until it is pressed', () => {
    render(withSlip(slipView([pick(1), pick(2)])))
    const trigger = screen.getByRole('button', { name: 'Slip (2)' })
    expect(trigger).toHaveClass('md:hidden', 'fixed', 'bottom-[calc(94px+var(--safe-bottom))]')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Place parlay' })).toBeNull()
    expect(screen.queryByLabelText('Stake (DC)')).toBeNull()
  })

  it('opens a bottom sheet named by the slip heading, holding the picks, the stake and Place parlay', async () => {
    render(withSlip(slipView([pick(1), pick(2)])))
    await userEvent.click(screen.getByRole('button', { name: 'Slip (2)' }))

    const sheet = await screen.findByRole('dialog', { name: 'Your slip' })
    expect(within(sheet).getByRole('link', { name: 'Market 1?' })).toHaveAttribute('href', '/markets/m1')
    expect(within(sheet).getByRole('link', { name: 'Market 2?' })).toBeInTheDocument()
    expect(within(sheet).getByText(/^Combined:/)).toHaveTextContent('Combined: 16.00×')
    expect(within(sheet).getByLabelText('Stake (DC)')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Place parlay' })).toBeInTheDocument()
  })

  it('closes on Escape and on its close button, returning focus to the trigger', async () => {
    render(withSlip(slipView([pick(1), pick(2)])))
    const trigger = screen.getByRole('button', { name: 'Slip (2)' })

    await userEvent.click(trigger)
    await screen.findByRole('dialog', { name: 'Your slip' })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger).toHaveFocus()

    await userEvent.click(trigger)
    await userEvent.click(await screen.findByRole('button', { name: 'Close slip' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger).toHaveFocus()
  })

  it('stays open with the success message after placing empties the slip', async () => {
    placeParlayAction.mockResolvedValue({ placed: { multiplierBp: 160_000, potentialPayout: 80 } })
    const { rerender } = render(withSlip(slipView([pick(1), pick(2)])))

    await userEvent.click(screen.getByRole('button', { name: 'Slip (2)' }))
    await userEvent.type(await screen.findByLabelText('Stake (DC)'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Place parlay' }))
    await screen.findByText('Parlay placed at 16.00× — potential payout 80 DC.')

    rerender(withSlip(slipView([])))
    const sheet = screen.getByRole('dialog', { name: 'Your slip' })
    expect(within(sheet).getByText('Parlay placed at 16.00× — potential payout 80 DC.')).toBeInTheDocument()
    expect(within(sheet).getByText('Your slip is empty.')).toBeInTheDocument()
    expect(screen.queryByText(/^Slip \(/)).toBeNull()
  })

  it('returns focus to the page heading, not the page, when closed after placing empties the slip', async () => {
    placeParlayAction.mockResolvedValue({ placed: { multiplierBp: 160_000, potentialPayout: 80 } })
    const { rerender } = render(withSlip(slipView([pick(1), pick(2)]), undefined, <h1>Will it rain on the church picnic?</h1>))

    await userEvent.click(screen.getByRole('button', { name: 'Slip (2)' }))
    await userEvent.type(await screen.findByLabelText('Stake (DC)'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Place parlay' }))
    await screen.findByText('Parlay placed at 16.00× — potential payout 80 DC.')

    rerender(withSlip(slipView([]), undefined, <h1>Will it rain on the church picnic?</h1>))
    await userEvent.click(screen.getByRole('button', { name: 'Close slip' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })

  it('removes a pick from inside the sheet and updates the trigger count and hint', async () => {
    const { rerender } = render(withSlip(slipView([pick(1), pick(2)])))
    await userEvent.click(screen.getByRole('button', { name: 'Slip (2)' }))
    const sheet = await screen.findByRole('dialog', { name: 'Your slip' })

    await userEvent.click(within(sheet).getAllByRole('button', { name: /^Remove/ })[0])
    rerender(withSlip(slipView([pick(2)])))
    expect(within(sheet).getByText('Add at least one more pick to place a parlay.')).toBeInTheDocument()

    await userEvent.click(within(sheet).getByRole('button', { name: 'Close slip' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Slip (1)' })).toBeInTheDocument()
  })

  it('keeps the open sheet clear of the status band and its last control above the home indicator', async () => {
    render(withSlip(slipView([pick(1), pick(2)])))
    await userEvent.click(screen.getByRole('button', { name: 'Slip (2)' }))
    const sheet = await screen.findByRole('dialog', { name: 'Your slip' })

    expect(sheet).toHaveClass('max-h-[calc(100dvh-48px-var(--safe-top))]')
    const scroller = within(sheet).getByRole('button', { name: 'Place parlay' }).closest('.overflow-y-auto')
    expect(scroller).toHaveClass('overscroll-contain', 'pb-[calc(24px+var(--safe-bottom))]')
  })

  it('closes the sheet when a link inside it is clicked', async () => {
    render(withSlip(slipView([pick(1), pick(2)])))
    await userEvent.click(screen.getByRole('button', { name: 'Slip (2)' }))
    const sheet = await screen.findByRole('dialog', { name: 'Your slip' })

    await userEvent.click(within(sheet).getByRole('link', { name: 'Market 1?' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
