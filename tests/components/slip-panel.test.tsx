// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startTransition, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SlipPick, SlipView } from '@/lib/parlays/get-slip'
import { formatOdds, lmsrParlayQuote } from '@/lib/parlays/odds'

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
  legBlock: null,
  outcomePool: 10,
  totalPool: 20,
  ...overrides,
})
const viewOf = (...picks: SlipPick[]): SlipView => ({ picks, legBps: [], multiplierBp: 10_000, capped: false })

function OpenState() {
  return <output aria-label="Open">{String(useSlip().open)}</output>
}

// Stands in for the layout: a mode switch's action re-renders it with the server's updated slip,
// in a transition, as Next does with the action's refreshed props. The sheet's portal unmounts the
// panel when the slip closes, which "Toggle sheet" stands in for.
function Layout({ initial, balance = 100 }: { initial: SlipView; balance?: number }) {
  const [view, setView] = useState(initial)
  const [shown, setShown] = useState(true)
  setPickModeAction.mockImplementation(async (outcomeId: string, parlay: boolean) => {
    startTransition(() =>
      setView((v) => ({ ...v, picks: v.picks.map((p) => (p.outcomeId === outcomeId ? { ...p, parlay } : p)) })),
    )
    return true
  })
  return (
    <SlipProvider view={view} balance={balance}>
      <OpenState />
      <button type="button" onClick={() => setShown((s) => !s)}>
        Toggle sheet
      </button>
      {shown && <SlipPanel />}
    </SlipProvider>
  )
}

function renderPanel(view: SlipView, balance?: number) {
  return render(<Layout initial={view} balance={balance} />)
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

  // How it works gives each section the id how-<slug> (components/docs/markdown.tsx).
  it('links How parlays pay to the parlays section of How it works', () => {
    renderPanel(viewOf(pick(1)))
    expect(screen.getByRole('link', { name: 'How parlays pay' })).toHaveAttribute('href', '/how-it-works#how-the-slip-solo-bets-and-parlays')
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

    await userEvent.click(within(screen.getByRole('group', { name: /Bet type for Outcome 1/ })).getByRole('button', { name: 'Parlay' }))
    expect(setPickModeAction).toHaveBeenCalledWith(pick(1).outcomeId, true)
    const parlay = screen.getByRole('region', { name: 'Parlay · 1 pick' })
    expect(within(parlay).getByText(/needs at least 2 picks/)).toBeInTheDocument()

    await userEvent.click(within(screen.getByRole('group', { name: /Bet type for Outcome 2/ })).getByRole('button', { name: 'Parlay' }))
    const two = screen.getByRole('region', { name: 'Parlay · 2 picks' })
    // Each leg's odds are set when its market closes, so the slip shows an estimate.
    expect(within(two).getByText('~4.00×')).toBeInTheDocument()
    await userEvent.type(within(two).getByLabelText('Stake (DC)'), '5')
    expect(within(two).getByText('Pays ~20 DC if every pick wins')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Place 1 bet · 5 DC' })).not.toHaveAttribute('aria-disabled')
  })

  it('says why a pick can’t be a parlay leg, and holds the place until it’s Solo', async () => {
    renderPanel(viewOf(pick(1, { parlay: true, legBlock: 'floor' }), pick(2, { parlay: true, legBlock: 'own_market' })))
    expect(screen.getByText(/needs at least 50 DC from 2 other members on its market/)).toBeInTheDocument()
    expect(screen.getByText(/You created this market, so it can’t be in a parlay/)).toBeInTheDocument()
    const parlay = screen.getByRole('region', { name: 'Parlay · 2 picks' })
    await userEvent.type(within(parlay).getByLabelText('Stake (DC)'), '5')
    expect(screen.getByRole('button', { name: 'Place 1 bet · 5 DC' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('caps the parlay payout, and the stake, at 1,000 DC', async () => {
    renderPanel(viewOf(pick(1, { parlay: true, oddsBp: 50_000 }), pick(2, { parlay: true, oddsBp: 50_000 })), 2000)
    const parlay = screen.getByRole('region', { name: 'Parlay · 2 picks' })
    expect(within(parlay).getByText('~20.00× (capped at 20×)')).toBeInTheDocument()
    const stake = within(parlay).getByLabelText('Stake (DC)')
    await userEvent.type(stake, '60')
    expect(within(parlay).getByText('Pays ~1000 DC if every pick wins, the most a parlay pays')).toBeInTheDocument()
    await userEvent.clear(stake)
    await userEvent.type(stake, '1001')
    expect(within(parlay).getByText('A parlay pays at most 1000 DC, so stake at most 1000 DC.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Place 1 bet · 1001 DC' })).toHaveAttribute('aria-disabled', 'true')
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
    await waitFor(() => expect(success).toHaveBeenCalledWith('Placed 1 solo bet and a 2-leg parlay at ~4.00×.'))
  })

  describe('a pick on an lmsr market (0102)', () => {
    const lmsr = (n: number, overrides: Partial<SlipPick> = {}) =>
      pick(n, { lmsr: { q: [0, 0], index: 0, liquidity: 50 }, ...overrides })

    it('shows the exact payout, sends it with the stake, and says bets are final', async () => {
      placeSlipAction.mockResolvedValue({ placed: { solos: 1, parlay: null } })
      renderPanel(viewOf(lmsr(1)))
      // A share at 50% pays 2× a DC at the margin.
      expect(screen.getByText('2.00×')).toBeInTheDocument()
      expect(screen.getByText('Bets are final: once placed, they can’t be cancelled.')).toBeInTheDocument()

      await userEvent.type(screen.getByLabelText('Stake (DC)'), '10')
      // The spec's worked example: 10 DC buys 18.33 shares.
      expect(screen.getByText('Pays 18 DC if it wins')).toBeInTheDocument()
      expect(screen.queryByText(/Pays ~/)).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Place 1 bet · 10 DC' }))
      await waitFor(() => expect(placeSlipAction).toHaveBeenCalled())
      const data = placeSlipAction.mock.calls[0][1] as FormData
      expect(data.get(`payout:${lmsr(1).outcomeId}`)).toBe('18')
      await waitFor(() => expect(success).toHaveBeenCalledWith('Placed 1 solo bet. Bets are final.'))
    })

    it('makes a parlay of lmsr picks with its exact payout, sends it, and toasts the fixed figures (0104)', async () => {
      placeSlipAction.mockResolvedValue({ placed: { solos: 0, parlay: { legs: 2, multiplierBp: 33_611, potentialPayout: 33, fixed: true } } })
      renderPanel(viewOf(lmsr(1, { parlay: true }), lmsr(2, { parlay: true })))
      expect(screen.getByText(/Your stake is split evenly across these picks/)).toBeInTheDocument()
      await userEvent.type(screen.getByLabelText('Stake (DC)'), '10')
      const quote = lmsrParlayQuote([{ q: [0, 0], index: 0, liquidity: 50 }, { q: [0, 0], index: 0, liquidity: 50 }], 10)
      const multiplier = `${formatOdds(quote.multiplierBp)}×`
      expect(screen.getByText(`Pays ${quote.payout} DC (${multiplier}) if every pick wins`)).toBeInTheDocument()
      expect(screen.getByText(multiplier)).toBeInTheDocument()
      expect(screen.queryByText(/~/)).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Place 1 bet · 10 DC' }))
      await waitFor(() => expect(placeSlipAction).toHaveBeenCalled())
      const data = placeSlipAction.mock.calls[0][1] as FormData
      expect(data.get('parlay_payout')).toBe(String(quote.payout))
      await waitFor(() => expect(success).toHaveBeenCalledWith('Placed a 2-leg parlay paying 33 DC (3.36×). Bets are final.'))
    })

    it('takes a parlay stake over 1,000 DC, since nothing caps a fixed parlay', async () => {
      renderPanel(viewOf(lmsr(1, { parlay: true }), lmsr(2, { parlay: true })), 5000)
      await userEvent.type(screen.getByLabelText('Stake (DC)'), '1200')
      expect(screen.getByText(/^Pays \d+ DC \(.+×\) if every pick wins$/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Place 1 bet · 1200 DC' })).toBeEnabled()
    })

    it('won’t mix lmsr and pool picks in one parlay', () => {
      renderPanel(viewOf(lmsr(1, { parlay: true }), pick(2, { parlay: true })))
      expect(screen.getAllByText(/A parlay can’t mix markets with fixed payouts and older markets/).length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: /^Place/ })).toBeDisabled()
    })

    it('shows a moved price on the pick and keeps the slip to place again', async () => {
      placeSlipAction.mockResolvedValue({
        pickErrors: { [lmsr(1).outcomeId]: 'The price moved, so this bet now pays 17 DC if it wins. Tap Place again to bet at the new price.' },
        priceMoved: true,
      })
      renderPanel(viewOf(lmsr(1)))
      await userEvent.type(screen.getByLabelText('Stake (DC)'), '10')
      await userEvent.click(screen.getByRole('button', { name: 'Place 1 bet · 10 DC' }))
      const stake = await screen.findByLabelText('Stake (DC)')
      await waitFor(() => expect(stake).toHaveAccessibleDescription(/now pays 17 DC/))
      expect(stake).toHaveValue(10)
      expect(success).not.toHaveBeenCalled()
    })

    it('drops a moved-price message once the stake it named changes', async () => {
      placeSlipAction.mockResolvedValue({
        pickErrors: { [lmsr(1).outcomeId]: 'The price moved, so this bet now pays 17 DC if it wins. Tap Place again to bet at the new price.' },
        priceMoved: true,
        movedStakes: { [lmsr(1).outcomeId]: '10' },
      })
      renderPanel(viewOf(lmsr(1)))
      await userEvent.type(screen.getByLabelText('Stake (DC)'), '10')
      await userEvent.click(screen.getByRole('button', { name: 'Place 1 bet · 10 DC' }))
      expect(await screen.findByText(/now pays 17 DC/)).toBeInTheDocument()
      await userEvent.type(screen.getByLabelText('Stake (DC)'), '0')
      expect(screen.queryByText(/now pays 17 DC/)).not.toBeInTheDocument()
      expect(screen.getByText(/^Pays \d+ DC if it wins$/)).toBeInTheDocument()
    })
  })

  it('says the earlier attempt went through when the place was a replay (#226)', async () => {
    placeSlipAction.mockResolvedValue({ placed: { solos: 1, parlay: null, replayed: true } })
    renderPanel(viewOf(pick(1)))

    await userEvent.type(screen.getAllByLabelText('Stake (DC)')[0], '10')
    await userEvent.click(screen.getByRole('button', { name: 'Place 1 bet · 10 DC' }))

    await waitFor(() => expect(success).toHaveBeenCalledWith('Your earlier attempt already went through: 1 solo bet.'))
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

  describe('a lost response (#61, #192)', () => {
    it('says so, and a retry sends the same attempt key', async () => {
      placeSlipAction.mockRejectedValueOnce(new Error('Failed to fetch'))
      placeSlipAction.mockResolvedValueOnce({ placed: { solos: 1, parlay: null } })
      renderPanel(viewOf(pick(1)))

      await userEvent.type(screen.getByLabelText('Stake (DC)'), '7')
      const place = screen.getByRole('button', { name: 'Place 1 bet · 7 DC' })
      await userEvent.click(place)
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(/couldn’t confirm your bets/)
      expect(place).toHaveAccessibleDescription(/Nothing will be placed twice/)
      expect(screen.getByLabelText('Stake (DC)')).toHaveValue(7)

      await userEvent.click(screen.getByRole('button', { name: 'Place 1 bet · 7 DC' }))
      await waitFor(() => expect(success).toHaveBeenCalledWith('Placed 1 solo bet.'))
      expect(placeSlipAction).toHaveBeenCalledTimes(2)
      const keys = placeSlipAction.mock.calls.map((c) => (c[1] as FormData).get('idempotency_key'))
      expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/)
      expect(keys[1]).toBe(keys[0])
    })

    it('survives the sheet closing and reopening: the message shows again and the key is kept', async () => {
      placeSlipAction.mockRejectedValueOnce(new Error('Failed to fetch'))
      placeSlipAction.mockResolvedValueOnce({ placed: { solos: 1, parlay: null } })
      renderPanel(viewOf(pick(1)))

      await userEvent.type(screen.getByLabelText('Stake (DC)'), '7')
      await userEvent.click(screen.getByRole('button', { name: 'Place 1 bet · 7 DC' }))
      await screen.findByRole('alert')

      await userEvent.click(screen.getByRole('button', { name: 'Toggle sheet' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Toggle sheet' }))

      expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t confirm your bets/)
      expect(screen.getByLabelText('Stake (DC)')).toHaveValue(7)
      await userEvent.click(screen.getByRole('button', { name: 'Place 1 bet · 7 DC' }))
      await waitFor(() => expect(success).toHaveBeenCalledWith('Placed 1 solo bet.'))
      const keys = placeSlipAction.mock.calls.map((c) => (c[1] as FormData).get('idempotency_key'))
      expect(keys).toHaveLength(2)
      expect(keys[1]).toBe(keys[0])
    })

    it('gives way to a real answer: a later error replaces it, and a success clears the key', async () => {
      placeSlipAction.mockRejectedValueOnce(new Error('Failed to fetch'))
      placeSlipAction.mockResolvedValueOnce({ formError: 'Your slip is empty.' })
      placeSlipAction.mockResolvedValueOnce({ placed: { solos: 1, parlay: null } })
      placeSlipAction.mockResolvedValueOnce({ placed: { solos: 1, parlay: null } })
      renderPanel(viewOf(pick(1)))

      await userEvent.type(screen.getByLabelText('Stake (DC)'), '7')
      await userEvent.click(screen.getByRole('button', { name: 'Place 1 bet · 7 DC' }))
      await screen.findByRole('alert')
      await userEvent.click(screen.getByRole('button', { name: 'Place 1 bet · 7 DC' }))
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Your slip is empty.'))

      await userEvent.click(screen.getByRole('button', { name: 'Place 1 bet · 7 DC' }))
      await waitFor(() => expect(success).toHaveBeenCalledTimes(1))
      // The stakes are cleared on success; a fresh stake starts a fresh attempt.
      await userEvent.type(screen.getByLabelText('Stake (DC)'), '3')
      await userEvent.click(screen.getByRole('button', { name: 'Place 1 bet · 3 DC' }))
      await waitFor(() => expect(success).toHaveBeenCalledTimes(2))
      const keys = placeSlipAction.mock.calls.map((c) => (c[1] as FormData).get('idempotency_key'))
      expect(keys[1]).toBe(keys[0])
      expect(keys[2]).toBe(keys[0])
      expect(keys[3]).not.toBe(keys[0])
    })
  })

  describe('quick stakes', () => {
    it("sets a solo pick's stake from a chip", async () => {
      renderPanel(viewOf(pick(1)))
      const chips = screen.getByRole('group', { name: 'Quick stakes for Outcome 1, Market 1' })
      expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['5', '10', '25', 'Max'])

      await userEvent.click(within(chips).getByRole('button', { name: '25' }))
      expect(screen.getByLabelText('Stake (DC)')).toHaveValue(25)
      expect(screen.getByRole('button', { name: 'Place 1 bet · 25 DC' })).toBeInTheDocument()
    })

    it('makes Max the balance less the slip’s other stakes', async () => {
      renderPanel(viewOf(pick(1), pick(2)), 40)
      await userEvent.type(screen.getAllByLabelText('Stake (DC)')[0], '15')

      const second = screen.getByRole('group', { name: 'Quick stakes for Outcome 2, Market 2' })
      await userEvent.click(within(second).getByRole('button', { name: 'Max, 25 DC' }))
      expect(screen.getAllByLabelText('Stake (DC)')[1]).toHaveValue(25)
      // The first pick's own stake doesn't count against it: 40 less the second's 25.
      const first = screen.getByRole('group', { name: 'Quick stakes for Outcome 1, Market 1' })
      expect(within(first).getByRole('button', { name: /^Max/ })).toHaveAccessibleName('Max, 15 DC')
    })

    it('disables a chip that is more than is available, and Max at nothing left', async () => {
      renderPanel(viewOf(pick(1), pick(2)), 30)
      await userEvent.type(screen.getAllByLabelText('Stake (DC)')[0], '22')

      const chips = within(screen.getByRole('group', { name: 'Quick stakes for Outcome 2, Market 2' }))
      expect(chips.getByRole('button', { name: '5' })).toBeEnabled()
      expect(chips.getByRole('button', { name: '10' })).toBeDisabled()
      expect(chips.getByRole('button', { name: '25' })).toBeDisabled()
      expect(chips.getByRole('button', { name: 'Max, 8 DC' })).toBeEnabled()

      await userEvent.clear(screen.getAllByLabelText('Stake (DC)')[0])
      await userEvent.type(screen.getAllByLabelText('Stake (DC)')[0], '30')
      expect(chips.getByRole('button', { name: 'Max, 0 DC' })).toBeDisabled()
      expect(chips.getByRole('button', { name: '5' })).toBeDisabled()
    })

    it('stops counting the parlay stake against the solo chips once only one Parlay pick is left', async () => {
      renderPanel(viewOf(pick(1), pick(2, { parlay: true }), pick(3, { parlay: true })), 50)
      const parlay = within(screen.getByRole('region', { name: 'Parlay · 2 picks' }))
      await userEvent.type(parlay.getByLabelText('Stake (DC)'), '30')
      const solo = () => within(screen.getByRole('group', { name: 'Quick stakes for Outcome 1, Market 1' }))
      expect(solo().getByRole('button', { name: 'Max, 20 DC' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Place 2 bets · 30 DC' })).toBeInTheDocument()

      // A lone Parlay pick can't be placed and has no stake field, so its stake no longer holds anything back.
      await userEvent.click(within(screen.getByRole('group', { name: /Bet type for Outcome 3/ })).getByRole('button', { name: 'Solo' }))
      await screen.findByRole('region', { name: 'Parlay · 1 pick' })
      expect(solo().getByRole('button', { name: 'Max, 50 DC' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Place 3 bets' })).toBeInTheDocument()
    })

    it('sets the parlay stake from the parlay’s chips, net of the solo stakes', async () => {
      renderPanel(viewOf(pick(1), pick(2, { parlay: true }), pick(3, { parlay: true })), 50)
      await userEvent.type(screen.getByLabelText('Stake (DC)', { selector: '#slip-stake-' + pick(1).outcomeId }), '20')

      const parlay = within(screen.getByRole('region', { name: 'Parlay · 2 picks' }))
      const chips = within(parlay.getByRole('group', { name: 'Quick stakes for the parlay' }))
      expect(screen.queryByRole('group', { name: /Quick stakes for Outcome 2/ })).not.toBeInTheDocument()

      await userEvent.click(chips.getByRole('button', { name: 'Max, 30 DC' }))
      expect(parlay.getByLabelText('Stake (DC)')).toHaveValue(30)
      // The solo pick's own chips now leave out the parlay's 30.
      const solo = within(screen.getByRole('group', { name: 'Quick stakes for Outcome 1, Market 1' }))
      expect(solo.getByRole('button', { name: 'Max, 20 DC' })).toBeEnabled()
      expect(solo.getByRole('button', { name: '25' })).toBeDisabled()

      await userEvent.click(chips.getByRole('button', { name: '10' }))
      expect(parlay.getByLabelText('Stake (DC)')).toHaveValue(10)
    })
  })

  describe('the balance and why Place is held back (#260)', () => {
    const stakeOf = (n: number) => screen.getByLabelText('Stake (DC)', { selector: `#slip-stake-${pick(n).outcomeId}` })

    it('shows the balance and what the slip leaves, as stakes change', async () => {
      renderPanel(viewOf(pick(1), pick(2)), 120)
      expect(screen.getByText('Balance', { exact: false })).toHaveTextContent('Balance 120 DC')
      expect(screen.getByText('120 DC left after this slip')).toBeInTheDocument()
      await userEvent.type(stakeOf(1), '20')
      expect(screen.getByText('100 DC left after this slip')).toBeInTheDocument()
    })

    it('says to enter a stake for each Solo pick, and the button points to it', async () => {
      renderPanel(viewOf(pick(1), pick(2)), 120)
      await userEvent.type(stakeOf(1), '20')
      const place = screen.getByRole('button', { name: 'Place 2 bets · 20 DC' })
      expect(place).toHaveAttribute('aria-disabled', 'true')
      expect(place).toHaveAccessibleDescription('Enter a stake for each Solo pick.')
    })

    it('says how short the slip is, marks the stakes and holds Place', async () => {
      renderPanel(viewOf(pick(1), pick(2)), 10)
      await userEvent.type(stakeOf(1), '20')
      await userEvent.type(stakeOf(2), '10')
      expect(screen.getByText('20 DC short')).toHaveClass('text-loss')
      const place = screen.getByRole('button', { name: 'Place 2 bets · 30 DC' })
      expect(place).toHaveAttribute('aria-disabled', 'true')
      expect(place).toHaveAccessibleDescription('This slip needs 30 DC; you have 10 DC.')
      expect(stakeOf(1)).toHaveAttribute('aria-invalid', 'true')
      expect(stakeOf(1)).toHaveAccessibleDescription('This slip needs 30 DC; you have 10 DC.')

      await userEvent.clear(stakeOf(2))
      await userEvent.type(stakeOf(2), '0')
      await userEvent.clear(stakeOf(1))
      await userEvent.type(stakeOf(1), '5')
      expect(stakeOf(1)).toHaveAttribute('aria-invalid', 'false')
    })

    it('counts a parlay stake toward the shortfall too', async () => {
      renderPanel(viewOf(pick(1, { parlay: true }), pick(2, { parlay: true })), 10)
      const parlay = within(screen.getByRole('region', { name: 'Parlay · 2 picks' }))
      await userEvent.type(parlay.getByLabelText('Stake (DC)'), '15')
      expect(screen.getByText('5 DC short')).toBeInTheDocument()
      expect(parlay.getByLabelText('Stake (DC)')).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByRole('button', { name: 'Place 1 bet · 15 DC' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('asks for the parlay’s stake when that’s all that is missing', () => {
      renderPanel(viewOf(pick(1, { parlay: true }), pick(2, { parlay: true })), 50)
      expect(screen.getByRole('button', { name: 'Place 1 bet' })).toHaveAccessibleDescription('Enter a stake for the parlay.')
    })

    it('says nothing under a slip that is ready to place', async () => {
      renderPanel(viewOf(pick(1)), 50)
      await userEvent.type(stakeOf(1), '10')
      const place = screen.getByRole('button', { name: 'Place 1 bet · 10 DC' })
      expect(place).not.toHaveAttribute('aria-disabled')
      expect(place).not.toHaveAttribute('aria-describedby')
    })

    it('points a member at 0 DC to Tasks, keeping the picks', async () => {
      renderPanel(viewOf(pick(1), pick(2)), 0)
      expect(screen.getByText('Balance', { exact: false })).toHaveTextContent('Balance 0 DC')
      const place = screen.getByRole('button', { name: 'Place 2 bets' })
      expect(place).toHaveAccessibleDescription('You have 0 DC. Earn more with Tasks, then come back to this slip.')
      expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/tasks')
      await userEvent.type(stakeOf(1), '20')
      expect(screen.getByText('20 DC short')).toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    })

    it('links How parlays pay to its section’s id on How it works', () => {
      renderPanel(viewOf(pick(1)))
      expect(screen.getByRole('link', { name: 'How parlays pay' })).toHaveAttribute('href', '/how-it-works#how-the-slip-solo-bets-and-parlays')
    })
  })
})
