// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SlipPick as SlipPickView, SlipView } from '@/lib/parlays/get-slip'
import { combineOdds } from '@/lib/parlays/odds'

const { placeParlayAction } = vi.hoisted(() => ({ placeParlayAction: vi.fn() }))
vi.mock('@/lib/parlays/place-parlay', () => ({ placeParlayAction }))
vi.mock('@/lib/parlays/slip-actions', () => ({ removeFromSlipAction: vi.fn() }))

import { SlipForm } from '@/app/(app)/parlays/slip-form'

function pick(n: number, available = true): SlipPickView {
  return { outcomeId: `o${n}`, outcomeLabel: 'Yes', marketId: `m${n}`, marketTitle: `Market ${n}?`, oddsBp: 40_000, available }
}

function slipView(picks: SlipPickView[]): SlipView {
  const legBps = picks.flatMap((p) => (p.available && p.oddsBp !== null ? [p.oddsBp] : []))
  return { picks, legBps, ...combineOdds(legBps), canPlace: picks.length >= 2 && picks.every((p) => p.available) }
}

beforeEach(() => {
  placeParlayAction.mockReset()
})

describe('SlipForm', () => {
  it('shows the empty state when the slip has no picks', () => {
    render(<SlipForm slip={slipView([])} />)
    const card = screen.getByRole('region', { name: 'Your slip' })
    expect(within(card).getByText('Empty')).toBeInTheDocument()
    expect(within(card).getByText('Your slip is empty.')).toBeInTheDocument()
    expect(within(card).getByText('Add picks from any open market.')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Browse markets' })).toHaveAttribute('href', '/markets')
    expect(screen.queryByRole('button', { name: 'Place parlay' })).toBeNull()
  })

  it('asks for another pick instead of offering a stake when there is only one', () => {
    render(<SlipForm slip={slipView([pick(1)])} />)
    expect(screen.getByText('1 pick · max 6')).toBeInTheDocument()
    expect(screen.getByText('Add at least one more pick to place a parlay.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse markets' })).toHaveAttribute('href', '/markets')
    expect(screen.queryByLabelText('Stake (DC)')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Place parlay' })).toBeNull()
  })

  it('shows the combined odds, and the payout once a stake is typed', async () => {
    render(<SlipForm slip={slipView([pick(1), pick(2)])} />)
    expect(screen.getByText('2 picks · max 6')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Remove Yes, Market \d\?$/ })).toHaveLength(2)
    expect(screen.getByText('Combined: 16.00×')).toBeInTheDocument()
    expect(screen.queryByText(/Potential payout/)).toBeNull()
    await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
    expect(screen.getByText(/Potential payout:/)).toHaveTextContent('Potential payout: 80 DC')
    expect(screen.getByRole('button', { name: 'Place parlay' })).toBeEnabled()
  })

  it('notes a capped multiplier and caps the payout', async () => {
    render(<SlipForm slip={slipView([pick(1), pick(2), pick(3)])} />)
    expect(screen.getByText('Combined: 20.00× (capped at 20×)')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
    expect(screen.getByText(/Potential payout:/)).toHaveTextContent('Potential payout: 100 DC')
  })

  it('blocks placing while a pick is no longer available, and says why', () => {
    render(<SlipForm slip={slipView([pick(1), pick(2, false)])} />)
    expect(screen.getByText('No longer available')).toBeInTheDocument()
    expect(screen.getByText('Combined: 4.00×')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Place parlay' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('Remove the pick that’s no longer available to place this parlay.')
  })

  it('shows a server error and ties it to the stake field', async () => {
    placeParlayAction.mockResolvedValue({ formError: 'Insufficient balance — you have 3 DC. Try a smaller amount.' })
    render(<SlipForm slip={slipView([pick(1), pick(2)])} />)
    const stake = screen.getByLabelText('Stake (DC)')
    expect(stake).toHaveAttribute('aria-invalid', 'false')
    await userEvent.type(stake, '5')
    await userEvent.click(screen.getByRole('button', { name: 'Place parlay' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Insufficient balance — you have 3 DC. Try a smaller amount.')
    expect(alert).toHaveAttribute('id', 'slip-error')
    expect(stake).toHaveAttribute('aria-invalid', 'true')
    expect(stake).toHaveAccessibleDescription('Insufficient balance — you have 3 DC. Try a smaller amount.')
    expect((placeParlayAction.mock.calls[0][1] as FormData).get('stake')).toBe('5')
  })

  it('keeps the success message after the placed slip empties', async () => {
    placeParlayAction.mockResolvedValue({ placed: { multiplierBp: 160_000, potentialPayout: 80 } })
    const { rerender } = render(<SlipForm slip={slipView([pick(1), pick(2)])} />)
    await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Place parlay' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Parlay placed at 16.00× — potential payout 80 DC.')

    rerender(<SlipForm slip={slipView([])} />)
    expect(screen.getByRole('status')).toHaveTextContent('Parlay placed at 16.00× — potential payout 80 DC.')
    expect(screen.getByText('Your slip is empty.')).toBeInTheDocument()
  })
})
