// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SlipPick as SlipPickView, SlipView } from '@/lib/parlays/get-slip'
import { combineOdds } from '@/lib/parlays/odds'

type NumberFlowProps = { value: number; suffix?: string; locales?: unknown; format?: { useGrouping?: boolean } }
const { numberFlowCalls } = vi.hoisted(() => ({ numberFlowCalls: [] as NumberFlowProps[] }))
vi.mock('@number-flow/react', () => ({
  default: (props: NumberFlowProps) => {
    numberFlowCalls.push(props)
    return `${props.value}${props.suffix ?? ''}`
  },
}))

const { placeParlayAction } = vi.hoisted(() => ({ placeParlayAction: vi.fn() }))
vi.mock('@/lib/parlays/place-parlay', () => ({ placeParlayAction }))
const { removeFromSlipAction } = vi.hoisted(() => ({ removeFromSlipAction: vi.fn() }))
vi.mock('@/lib/parlays/slip-actions', () => ({ removeFromSlipAction }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
const { haptics } = vi.hoisted(() => ({ haptics: { tap: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/haptics', () => ({ haptics }))

import { SlipCountProvider, useSlipCount } from '@/components/app-nav/slip-count'
import { MarketSlipProvider } from '@/components/markets/market-slip'
import { OutcomeSlipControl } from '@/components/markets/outcome-slip-control'
import { SlipForm } from '@/app/(app)/parlays/slip-form'

function Count() {
  return <output aria-label="Slip count">{useSlipCount().count}</output>
}

function pick(n: number, available = true): SlipPickView {
  return { outcomeId: `o${n}`, outcomeLabel: 'Yes', marketId: `m${n}`, marketTitle: `Market ${n}?`, oddsBp: 40_000, available }
}

function slipView(picks: SlipPickView[]): SlipView {
  const legBps = picks.flatMap((p) => (p.available && p.oddsBp !== null ? [p.oddsBp] : []))
  return { picks, legBps, ...combineOdds(legBps), canPlace: picks.length >= 2 && picks.every((p) => p.available) }
}

beforeEach(() => {
  placeParlayAction.mockReset()
  removeFromSlipAction.mockReset()
  haptics.success.mockReset()
  haptics.error.mockReset()
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
    expect(screen.getByText('16.00×', { selector: '.sr-only' })).toBeInTheDocument()
    expect(screen.queryByText(/Potential payout/)).toBeNull()
    await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
    expect(screen.getByText(/Potential payout:/)).toHaveTextContent('Potential payout: 80 DC')
    expect(screen.getByRole('button', { name: 'Place parlay' })).toBeEnabled()
  })

  it('formats the combined odds and the payout as plain digits, in en-US regardless of the browser locale', async () => {
    numberFlowCalls.length = 0
    render(<SlipForm slip={slipView([pick(1), pick(2)])} />)
    await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
    expect(numberFlowCalls.length).toBeGreaterThanOrEqual(2)
    for (const call of numberFlowCalls) {
      expect(call.locales).toBe('en-US')
      expect(call.format?.useGrouping).toBe(false)
    }
  })

  it('notes a capped multiplier and caps the payout', async () => {
    render(<SlipForm slip={slipView([pick(1), pick(2), pick(3)])} />)
    expect(screen.getByText('20.00× (capped at 20×)', { selector: '.sr-only' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
    expect(screen.getByText(/Potential payout:/)).toHaveTextContent('Potential payout: 100 DC')
  })

  it('blocks placing while a pick is no longer available, and says why', () => {
    render(<SlipForm slip={slipView([pick(1), pick(2, false)])} />)
    expect(screen.getByText('No longer available')).toBeInTheDocument()
    // The live pick's own odds are also 4.00×, so match the Combined line's text rather than a bare number.
    expect(screen.getByText(/^Combined:/)).toHaveTextContent('Combined: 4.00×')
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

  it('drops a removed pick and the nav count at once, and brings both back when nothing changed', async () => {
    let finish!: (value: boolean) => void
    removeFromSlipAction.mockImplementation(() => new Promise<boolean>((resolve) => (finish = resolve)))
    render(
      <SlipCountProvider initial={2}>
        <Count />
        <SlipForm slip={slipView([pick(1), pick(2)])} />
      </SlipCountProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove Yes, Market 1?' }))

    expect(removeFromSlipAction).toHaveBeenCalledWith('o1', expect.any(FormData))
    expect(screen.queryByRole('link', { name: 'Market 1?' })).toBeNull()
    expect(screen.getByText('1 pick · max 6')).toBeInTheDocument()
    expect(screen.getByText('Add at least one more pick to place a parlay.')).toBeInTheDocument()
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('1')

    await act(async () => finish(false))

    expect(screen.getByRole('link', { name: 'Market 1?' })).toBeInTheDocument()
    expect(screen.getByText('2 picks · max 6')).toBeInTheDocument()
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('2')
  })

  it('disables Place parlay and hides Combined and the payout while a removal is pending on a fuller slip, and brings both back once the server catches up', async () => {
    let finish!: (value: boolean) => void
    removeFromSlipAction.mockImplementation(() => new Promise<boolean>((resolve) => (finish = resolve)))
    const { rerender } = render(<SlipForm slip={slipView([pick(1), pick(2), pick(3)])} />)
    await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
    expect(screen.getByRole('button', { name: 'Place parlay' })).toBeEnabled()
    expect(screen.getByText(/^Combined:/)).toBeInTheDocument()
    expect(screen.getByText(/Potential payout:/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove Yes, Market 1?' }))

    expect(screen.getByText('2 picks · max 6')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Place parlay' })).toBeDisabled()
    expect(screen.queryByText(/^Combined:/)).toBeNull()
    expect(screen.queryByText(/Potential payout:/)).toBeNull()

    await act(async () => finish(true))
    rerender(<SlipForm slip={slipView([pick(2), pick(3)])} />)

    expect(screen.getByRole('button', { name: 'Place parlay' })).toBeEnabled()
    expect(screen.getByText(/^Combined:/)).toBeInTheDocument()
    expect(screen.getByText(/Potential payout:/)).toBeInTheDocument()
  })

  it('buzzes success once a parlay is placed, and error (from the inline message) when it fails', async () => {
    placeParlayAction.mockResolvedValueOnce({ formError: 'Insufficient balance — you have 3 DC. Try a smaller amount.' })
    placeParlayAction.mockResolvedValueOnce({ placed: { multiplierBp: 160_000, potentialPayout: 80 } })
    render(<SlipForm slip={slipView([pick(1), pick(2)])} />)
    await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')

    await userEvent.click(screen.getByRole('button', { name: 'Place parlay' }))
    await screen.findByRole('alert')
    expect(haptics.error).toHaveBeenCalledOnce()
    expect(haptics.success).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Place parlay' }))
    await screen.findByRole('status')
    expect(haptics.success).toHaveBeenCalledOnce()
  })

  it('flips a market’s own outcome row off when its pick is removed from here, before the server answers', async () => {
    let finish!: (value: boolean) => void
    removeFromSlipAction.mockImplementation(() => new Promise<boolean>((resolve) => (finish = resolve)))
    render(
      <MarketSlipProvider pick="o1">
        <OutcomeSlipControl outcomeId="o1" label="Yes" state="inslip" addAction={vi.fn()} removeAction={vi.fn()} />
        <SlipForm slip={slipView([pick(1)])} />
      </MarketSlipProvider>,
    )
    expect(screen.getByText('In your slip')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove Yes, Market 1?' }))

    expect(screen.queryByText('In your slip')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add to parlay Yes' })).toBeInTheDocument()

    await act(async () => finish(true))
  })
})
