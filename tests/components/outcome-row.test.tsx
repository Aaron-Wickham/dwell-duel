// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OutcomeRow, type OutcomeRowState } from '@/components/markets/outcome-row'
import { SlipProvider } from '@/components/slip/slip-provider'
import { EMPTY_SLIP, type SlipPick } from '@/lib/parlays/get-slip'

const pickFor = (outcomeId: string, outcomeLabel: string): SlipPick => ({
  outcomeId,
  outcomeLabel,
  marketId: 'm1',
  marketTitle: 'Will it rain?',
  parlay: false,
  open: true,
  oddsBp: 13333,
  legBlock: null,
  outcomePool: 60,
  totalPool: 80,
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

function renderRow(state: OutcomeRowState, overrides: Partial<Parameters<typeof OutcomeRow>[0]> = {}) {
  const addAction = vi.fn()
  const removeAction = vi.fn()
  // The slip itself decides whether a row reads "In your slip", so an inslip row needs it there.
  const view = state === 'inslip' ? { ...EMPTY_SLIP, picks: [pickFor('o1', 'Yes')] } : EMPTY_SLIP
  render(
    <SlipProvider view={view}>
      <OutcomeRow
        label="Yes"
        poolTotal={60}
        probability={0.75}
        oddsBp={13333}
        series={2}
        state={state}
        slipPick={pickFor('o1', 'Yes')}
        addAction={addAction}
        removeAction={removeAction}
        {...overrides}
      />
    </SlipProvider>,
  )
  return { addAction, removeAction }
}

describe('OutcomeRow', () => {
  it('shows the chance, the pool and the payout multiplier', () => {
    renderRow('add')
    expect(screen.getByText('75% (60 DC)', { selector: '.sr-only' })).toBeInTheDocument()
    expect(screen.getByText('1.33× payout per DC', { selector: '.sr-only' })).toBeInTheDocument()
  })

  it('adds the outcome to the slip, naming the outcome for screen readers', async () => {
    const { addAction } = renderRow('add')
    const add = screen.getByRole('button', { name: 'Add to slip Yes' })
    expect(add).toBeEnabled()
    expect(add).toHaveAttribute('type', 'submit')
    await userEvent.click(add)
    await waitFor(() => expect(addAction).toHaveBeenCalledWith(expect.any(FormData)))
  })

  it('marks an outcome already in the slip and removes it', async () => {
    const { removeAction } = renderRow('inslip')
    expect(screen.getByText('In your slip')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add to slip/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Yes' }))
    await waitFor(() => expect(removeAction).toHaveBeenCalledWith(expect.any(FormData)))
  })

  it('shows Add to slip disabled when the slip is full', () => {
    renderRow('disabled')
    expect(screen.getByRole('button', { name: 'Add to slip Yes' })).toBeDisabled()
    expect(screen.getByText('1.33× payout per DC', { selector: '.sr-only' })).toBeInTheDocument()
  })

  it('links the disabled Add to slip button to the reason it is disabled', () => {
    renderRow('disabled', { disabledReasonId: 'slip-full-note' })
    expect(screen.getByRole('button', { name: 'Add to slip Yes' })).toHaveAttribute('aria-describedby', 'slip-full-note')
  })

  it('has no aria-describedby on the disabled button when no reason is given', () => {
    renderRow('disabled')
    expect(screen.getByRole('button', { name: 'Add to slip Yes' })).not.toHaveAttribute('aria-describedby')
  })

  it('hides the payout and every action when there is nothing to do', () => {
    renderRow('none')
    expect(screen.getByText('75% (60 DC)', { selector: '.sr-only' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/payout per DC/)).not.toBeInTheDocument()
  })

  it('flags only the winning outcome', () => {
    renderRow('none', { winner: true })
    expect(screen.getByText('Winner')).toBeInTheDocument()
  })

  it('does not flag an outcome that did not win', () => {
    renderRow('none')
    expect(screen.queryByText('Winner')).not.toBeInTheDocument()
  })

  it('formats every animated number as plain digits, in en-US regardless of the browser locale', () => {
    renderRow('add')
    expect(numberFlowCalls.length).toBeGreaterThan(0)
    for (const call of numberFlowCalls) {
      expect(call.locales).toBe('en-US')
      expect(call.format?.useGrouping).toBe(false)
    }
  })

  it('reads 0% before anyone has bet', () => {
    renderRow('none', { poolTotal: 0, probability: null, oddsBp: null })
    expect(screen.getByText('0% (0 DC)', { selector: '.sr-only' })).toBeInTheDocument()
  })

  it('gives every row its own button name', () => {
    const noop = vi.fn()
    render(
      <ul>
        {['Yes', 'No'].map((label) => (
          <li key={label}>
            <OutcomeRow
              label={label}
              slipPick={pickFor(label, label)}
              poolTotal={10}
              probability={0.5}
              oddsBp={20000}
              series={label === 'Yes' ? 2 : 1}
              state="add"
              addAction={noop}
              removeAction={noop}
            />
          </li>
        ))}
      </ul>,
    )
    expect(screen.getByRole('button', { name: 'Add to slip Yes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to slip No' })).toBeInTheDocument()
  })

  // #279: parlay money shows beside the odds, never in them.
  it('shows the parlay money riding on the outcome under the bar, outside the chance and the pool', () => {
    renderRow('add', { riding: 45 })
    const riding = screen.getByText('+45 DC riding in parlays')
    expect(riding.closest('p')).toHaveClass('text-ink2')
    expect(screen.getByText('75% (60 DC)', { selector: '.sr-only' })).toBeInTheDocument()
    expect(screen.getByText('1.33× payout per DC', { selector: '.sr-only' })).toBeInTheDocument()
  })

  it('shows no parlay line when nothing rides on the outcome', () => {
    renderRow('add', { riding: 0 })
    expect(screen.queryByText(/riding in parlays/)).toBeNull()
  })
})
