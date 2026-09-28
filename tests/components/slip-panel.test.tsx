// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startTransition, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SlipPick, SlipView } from '@/lib/parlays/get-slip'

const { placeSlipAction, setPickModeAction, removeFromSlipAction, success } = vi.hoisted(() => ({
  placeSlipAction: vi.fn(),
  setPickModeAction: vi.fn(),
  removeFromSlipAction: vi.fn(),
  success: vi.fn(),
}))
vi.mock('@/lib/parlays/place-slip', () => ({ placeSlipAction }))
vi.mock('@/lib/parlays/slip-actions', () => ({ setPickModeAction, removeFromSlipAction }))
vi.mock('sonner', () => ({ toast: { success } }))

import { SlipProvider, useSlip } from '@/components/slip/slip-provider'
import { SlipPanel } from '@/components/slip/slip-panel'

const pick = (n: number, overrides: Partial<SlipPick> = {}): SlipPick => ({
  outcomeId: `0000000${n}-0000-4000-8000-000000000000`,
  outcomeLabel: `Outcome ${n}`,
  marketId: `m${n}`,
  marketTitle: `Market ${n}`,
  parlay: false,
  open: true,
  oddsBp: 20_000,
  outcomePool: 10,
  totalPool: 20,
  ...overrides,
})
const viewOf = (...picks: SlipPick[]): SlipView => ({ picks, legBps: [], multiplierBp: 10_000, capped: false })

function OpenState() {
  return <output aria-label="Open">{String(useSlip().open)}</output>
}

// Stands in for the layout: a mode switch's action re-renders it with the server's updated slip,
// in a transition, as Next does with the action's refreshed props.
function Layout({ initial }: { initial: SlipView }) {
  const [view, setView] = useState(initial)
  setPickModeAction.mockImplementation(async (outcomeId: string, parlay: boolean) => {
    startTransition(() =>
      setView((v) => ({ ...v, picks: v.picks.map((p) => (p.outcomeId === outcomeId ? { ...p, parlay } : p)) })),
    )
    return true
  })
  return (
    <SlipProvider view={view}>
      <OpenState />
      <SlipPanel />
    </SlipProvider>
  )
}

function renderPanel(view: SlipView) {
  return render(<Layout initial={view} />)
}

beforeEach(() => {
  for (const fn of [placeSlipAction, setPickModeAction, removeFromSlipAction, success]) fn.mockReset()
})

describe('SlipPanel', () => {
  it('shows the empty state with a way to markets', () => {
    renderPanel(viewOf())
    expect(screen.getByText('Your slip is empty.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse markets' })).toHaveAttribute('href', '/markets')
  })

  it('starts each pick as Solo, with its own stake and an estimated payout', async () => {
    renderPanel(viewOf(pick(1)))
    const group = screen.getByRole('group', { name: 'Bet type for Outcome 1, Market 1' })
    expect(within(group).getByRole('button', { name: 'Solo' })).toHaveAttribute('aria-pressed', 'true')
    const place = screen.getByRole('button', { name: 'Place 1 bet' })
    expect(place).toHaveAttribute('aria-disabled', 'true')

    await userEvent.type(screen.getByLabelText('Stake (DC)'), '10')
    // floor(10 × (20 + 10) / (10 + 10)) = 15
    expect(screen.getByText('Pays ~15 DC if it wins')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Place 1 bet · 10 DC' })).not.toHaveAttribute('aria-disabled')
  })

  it('moves picks into one parlay with a shared stake, and needs two of them', async () => {
    renderPanel(viewOf(pick(1), pick(2)))

    await userEvent.click(within(screen.getByRole('group', { name: /Outcome 1/ })).getByRole('button', { name: 'Parlay' }))
    expect(setPickModeAction).toHaveBeenCalledWith(pick(1).outcomeId, true)
    const parlay = screen.getByRole('region', { name: 'Parlay · 1 pick' })
    expect(within(parlay).getByText(/needs at least 2 picks/)).toBeInTheDocument()

    await userEvent.click(within(screen.getByRole('group', { name: /Outcome 2/ })).getByRole('button', { name: 'Parlay' }))
    const two = screen.getByRole('region', { name: 'Parlay · 2 picks' })
    expect(within(two).getByText('4.00×')).toBeInTheDocument()
    await userEvent.type(within(two).getByLabelText('Stake (DC)'), '5')
    expect(within(two).getByText('Pays 20 DC if every pick wins')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Place 1 bet · 5 DC' })).not.toHaveAttribute('aria-disabled')
  })

  it('keeps an outcome nobody has bet on to Solo, and says why', () => {
    renderPanel(viewOf(pick(1, { oddsBp: null, outcomePool: 0 })))
    const parlay = screen.getByRole('button', { name: 'Parlay' })
    expect(parlay).toBeDisabled()
    expect(parlay).toHaveAccessibleDescription(/no odds to lock into a parlay/)
  })

  it('blocks placing while a pick is no longer available', () => {
    renderPanel(viewOf(pick(1), pick(2, { open: false })))
    expect(screen.getByText('No longer available')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Place 2 bets' })).toHaveAccessibleDescription(
      'Remove the picks that are no longer available to place your slip.',
    )
  })

  it('posts every pick with its mode and stake, then toasts and closes on success', async () => {
    placeSlipAction.mockResolvedValue({ placed: { solos: 1, parlay: { legs: 2, multiplierBp: 40_000, potentialPayout: 20 } } })
    renderPanel(viewOf(pick(1), pick(2, { parlay: true }), pick(3, { parlay: true })))

    await userEvent.type(screen.getAllByLabelText('Stake (DC)')[0], '10')
    await userEvent.type(within(screen.getByRole('region', { name: 'Parlay · 2 picks' })).getByLabelText('Stake (DC)'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Place 2 bets · 15 DC' }))

    await waitFor(() => expect(placeSlipAction).toHaveBeenCalled())
    const data = placeSlipAction.mock.calls[0][1] as FormData
    expect(data.getAll('pick')).toEqual([`${pick(1).outcomeId}:solo`, `${pick(2).outcomeId}:parlay`, `${pick(3).outcomeId}:parlay`])
    expect(data.get(`stake:${pick(1).outcomeId}`)).toBe('10')
    expect(data.get('parlay_stake')).toBe('5')
    await waitFor(() => expect(success).toHaveBeenCalledWith('Placed 1 solo bet and a 2-leg parlay at 4.00×.'))
  })

  it("ties a failed pick's error to that pick's stake", async () => {
    placeSlipAction.mockResolvedValue({ pickErrors: { [pick(1).outcomeId]: 'Market is not open for betting.' } })
    renderPanel(viewOf(pick(1)))

    await userEvent.type(screen.getByLabelText('Stake (DC)'), '3')
    await userEvent.click(screen.getByRole('button', { name: 'Place 1 bet · 3 DC' }))

    const stake = await screen.findByLabelText('Stake (DC)')
    await waitFor(() => expect(stake).toHaveAttribute('aria-invalid', 'true'))
    expect(stake).toHaveAccessibleDescription('Market is not open for betting.')
    expect(success).not.toHaveBeenCalled()
  })

  it('removes a pick at once, without submitting the slip', async () => {
    removeFromSlipAction.mockResolvedValue(true)
    renderPanel(viewOf(pick(1), pick(2)))

    await userEvent.click(screen.getByRole('button', { name: 'Remove Outcome 1, Market 1' }))
    expect(removeFromSlipAction).toHaveBeenCalledWith(pick(1).outcomeId)
    expect(placeSlipAction).not.toHaveBeenCalled()
  })
})
