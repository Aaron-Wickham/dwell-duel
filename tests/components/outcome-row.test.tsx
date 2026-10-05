// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OutcomeRow, type OutcomeRowState } from '@/components/markets/outcome-row'
import { SlipProvider } from '@/components/slip/slip-provider'
import { EMPTY_SLIP, type SlipPick } from '@/lib/parlays/get-slip'
import { lmsrQuote } from '@/lib/markets/pricing'
import { EXAMPLE_STAKE, soloPays } from '@/lib/parlays/solo-pays'

const pickFor = (outcomeId: string, outcomeLabel: string): SlipPick => ({
  outcomeId,
  outcomeLabel,
  marketId: 'm1',
  marketTitle: 'Will it rain?',
  parlay: false,
  open: true,
  lmsr: { q: [12, 0], index: 0, liquidity: 50 },
})

type NumberFlowProps = { value: number; suffix?: string; locales?: unknown; format?: { useGrouping?: boolean } }
const { numberFlowCalls } = vi.hoisted(() => ({ numberFlowCalls: [] as NumberFlowProps[] }))
vi.mock('@number-flow/react', () => ({
  default: (props: NumberFlowProps) => {
    numberFlowCalls.push(props)
    return `${props.value}${props.suffix ?? ''}`
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/lib/parlays/slip-actions', () => ({ setPickModeAction: vi.fn() }))

beforeEach(() => {
  numberFlowCalls.length = 0
})

const YES = pickFor('o1', 'Yes')
const PAYS = soloPays(YES.lmsr, EXAMPLE_STAKE)!

function renderRow(state: OutcomeRowState, overrides: Partial<Parameters<typeof OutcomeRow>[0]> = {}) {
  const addAction = vi.fn()
  const removeAction = vi.fn()
  // The slip itself decides whether a row reads "In your slip", so an inslip row needs it there.
  const view = state === 'inslip' ? { ...EMPTY_SLIP, picks: [YES] } : EMPTY_SLIP
  render(
    <SlipProvider view={view}>
      <OutcomeRow
        label="Yes"
        probability={0.75}
        state={state}
        pays={PAYS}
        slipPick={YES}
        addAction={addAction}
        removeAction={removeAction}
        {...overrides}
      />
    </SlipProvider>,
  )
  return { addAction, removeAction }
}

describe('OutcomeRow', () => {
  it('shows the chance alone, with what 10 DC wins under the name (#390)', () => {
    renderRow('add')
    expect(screen.getByText('75%', { selector: '.sr-only' })).toBeInTheDocument()
    expect(screen.getByText(`10 DC wins ${PAYS}`, { selector: '.sr-only' })).toBeInTheDocument()
    expect(screen.queryByText(/payout per DC|\(\d+ DC\)/)).toBeNull()
  })

  // The slip quotes a Solo stake with the same soloPays, so a row can't promise more than the slip.
  it('quotes exactly what place_lmsr_bet pays for 10 DC, the number the slip shows', () => {
    expect(EXAMPLE_STAKE).toBe(10)
    expect(PAYS).toBe(lmsrQuote([12, 0], 50, 0, 10).payout)
    expect(PAYS).toBeGreaterThanOrEqual(10)
  })

  it('adds the outcome to the slip, its name saying which', async () => {
    const { addAction } = renderRow('add')
    const add = screen.getByRole('button', { name: 'Add Yes to slip' })
    expect(add).toBeEnabled()
    expect(add).toHaveAttribute('type', 'submit')
    expect(add).toHaveTextContent(/^Add/)
    await userEvent.click(add)
    await waitFor(() => expect(addAction).toHaveBeenCalledWith(expect.any(FormData)))
  })

  it('says an outcome is in the slip, in place of the payout, and removes it', async () => {
    const { removeAction } = renderRow('inslip')
    expect(screen.getByText('In your slip')).toBeInTheDocument()
    expect(screen.queryByText(/wins/)).toBeNull()
    expect(screen.queryByRole('button', { name: /^Add/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Yes from slip' }))
    await waitFor(() => expect(removeAction).toHaveBeenCalledWith(expect.any(FormData)))
  })

  it('shows Add disabled when the slip is full, still quoting the payout', () => {
    renderRow('disabled')
    expect(screen.getByRole('button', { name: 'Add Yes to slip' })).toBeDisabled()
    expect(screen.getByText(`10 DC wins ${PAYS}`, { selector: '.sr-only' })).toBeInTheDocument()
  })

  it('links the disabled Add button to the reason it is disabled', () => {
    renderRow('disabled', { disabledReasonId: 'slip-full-note' })
    expect(screen.getByRole('button', { name: 'Add Yes to slip' })).toHaveAttribute('aria-describedby', 'slip-full-note')
  })

  it('has no aria-describedby on the disabled button when no reason is given', () => {
    renderRow('disabled')
    expect(screen.getByRole('button', { name: 'Add Yes to slip' })).not.toHaveAttribute('aria-describedby')
  })

  it('hides the payout and every action when there is nothing to do', () => {
    renderRow('none', { pays: null })
    expect(screen.getByText('75%', { selector: '.sr-only' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/wins/)).not.toBeInTheDocument()
  })

  it('marks the winner of a resolved market, and mutes the rest at their final chance', () => {
    renderRow('none', { pays: null, result: 'won' })
    expect(screen.getByText('Won')).toBeInTheDocument()
  })

  it('mutes an outcome that lost', () => {
    renderRow('none', { pays: null, result: 'lost' })
    expect(screen.queryByText('Won')).not.toBeInTheDocument()
    expect(screen.getByText('Yes').closest('.text-ink2')).not.toBeNull()
  })

  it('keys a multiple-choice outcome to its chart colour, and a two-outcome one not at all', () => {
    const { container, unmount } = render(
      <SlipProvider view={EMPTY_SLIP}>
        <OutcomeRow label="Red" probability={0.3} series={3} state="none" pays={null} slipPick={YES} addAction={vi.fn()} removeAction={vi.fn()} />
      </SlipProvider>,
    )
    expect(container.querySelector('.bg-s3')).not.toBeNull()
    unmount()
    renderRow('none', { pays: null })
    expect(document.querySelector('[class*="bg-s"]')).toBeNull()
  })

  it('groups every animated number in en-US, regardless of the browser locale (#382)', () => {
    renderRow('add')
    expect(numberFlowCalls.length).toBeGreaterThan(0)
    for (const call of numberFlowCalls) {
      expect(call.locales).toBe('en-US')
      expect(call.format?.useGrouping).not.toBe(false)
    }
  })

  it('reads 0% before there is a price', () => {
    renderRow('none', { probability: null, pays: null })
    expect(screen.getByText('0%', { selector: '.sr-only' })).toBeInTheDocument()
  })

  it('gives every row its own button name', () => {
    const noop = vi.fn()
    render(
      <SlipProvider view={EMPTY_SLIP}>
        <ul>
          {['Yes', 'No'].map((label) => (
            <li key={label}>
              <OutcomeRow
                label={label}
                slipPick={pickFor(label, label)}
                probability={0.5}
                pays={20}
                state="add"
                addAction={noop}
                removeAction={noop}
              />
            </li>
          ))}
        </ul>
      </SlipProvider>,
    )
    expect(screen.getByRole('button', { name: 'Add Yes to slip' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add No to slip' })).toBeInTheDocument()
  })
})
