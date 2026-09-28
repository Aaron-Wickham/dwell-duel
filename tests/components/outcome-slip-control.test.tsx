// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startTransition, useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlipProvider, useSlip } from '@/components/slip/slip-provider'
import { OutcomeSlipControl } from '@/components/markets/outcome-slip-control'
import { EMPTY_SLIP, type SlipPick, type SlipView } from '@/lib/parlays/get-slip'
import { CommitHistory } from './commit-history'

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success } }))
vi.mock('@/lib/parlays/slip-actions', () => ({ setPickModeAction: vi.fn() }))

beforeEach(() => {
  success.mockReset()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const pick = (outcomeId: string, outcomeLabel: string, marketId = 'm1'): SlipPick => ({
  outcomeId,
  outcomeLabel,
  marketId,
  marketTitle: `Market ${marketId}`,
  parlay: false,
  open: true,
  oddsBp: 20_000,
  outcomePool: 10,
  totalPool: 20,
})
const YES = pick('o1', 'Yes')
const NO = pick('o2', 'No')
const viewOf = (...picks: SlipPick[]): SlipView => ({ ...EMPTY_SLIP, picks })

function Count() {
  const { picks, open } = useSlip()
  return <output aria-label="Slip">{`Picks ${picks.length}${open ? ' · open' : ''}`}</output>
}

function countChips(text: string): number {
  return text.split('In your slip').length - 1
}

describe('OutcomeSlipControl', () => {
  it('flips to In your slip and adds the pick to the slip before the server answers', async () => {
    const answer = deferred<boolean>()
    const addAction = vi.fn(() => answer.promise)
    render(
      <SlipProvider view={viewOf()}>
        <Count />
        <OutcomeSlipControl pick={YES} state="add" addAction={addAction} removeAction={vi.fn()} />
      </SlipProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add to slip Yes' }))

    expect(addAction).toHaveBeenCalledWith(expect.any(FormData))
    expect(screen.getByText('In your slip')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Yes' })).toBeInTheDocument()
    expect(screen.getByLabelText('Slip')).toHaveTextContent('Picks 1')
    expect(success).not.toHaveBeenCalled()

    await act(async () => answer.resolve(true))
    await waitFor(() => expect(success).toHaveBeenCalledWith('Added to your slip.'))
  })

  it('flips back when the server makes no change', async () => {
    const answer = deferred<boolean>()
    render(
      <SlipProvider view={viewOf()}>
        <Count />
        <OutcomeSlipControl pick={YES} state="add" addAction={() => answer.promise} removeAction={vi.fn()} />
      </SlipProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add to slip Yes' }))
    expect(screen.getByText('In your slip')).toBeInTheDocument()

    await act(async () => answer.resolve(false))

    expect(screen.getByRole('button', { name: 'Add to slip Yes' })).toBeInTheDocument()
    expect(screen.getByLabelText('Slip')).toHaveTextContent('Picks 0')
    expect(success).not.toHaveBeenCalled()
  })

  it('opens the slip from a row that is in it', async () => {
    render(
      <SlipProvider view={viewOf(YES)}>
        <Count />
        <OutcomeSlipControl pick={YES} state="inslip" addAction={vi.fn()} removeAction={vi.fn()} />
      </SlipProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open slip' }))
    expect(screen.getByLabelText('Slip')).toHaveTextContent('Picks 1 · open')
  })

  it('keeps In your slip on screen while the server slip lands, with no flash back to Add', async () => {
    const history: string[] = []
    const answer = deferred<void>()

    function Page() {
      const [view, setView] = useState(viewOf())
      async function addAction() {
        await answer.promise
        // Next applies the action's refreshed server props in a transition, like this one.
        startTransition(() => setView(viewOf(YES)))
        return true
      }
      return (
        <SlipProvider view={view}>
          <p>{`Server slip: ${view.picks.length}`}</p>
          <Count />
          <OutcomeSlipControl pick={YES} state="add" addAction={addAction} removeAction={vi.fn()} />
        </SlipProvider>
      )
    }

    render(
      <CommitHistory history={history}>
        <Page />
      </CommitHistory>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add to slip Yes' }))
    expect(screen.getByText('Server slip: 0')).toBeInTheDocument()
    expect(screen.getByText('In your slip')).toBeInTheDocument()
    const flipped = history.length

    // Not inside act(): React commits the rest in separate tasks, as in a browser.
    answer.resolve()
    await waitFor(() => expect(screen.getByText('Server slip: 1')).toBeInTheDocument())

    for (const text of history.slice(flipped - 1)) {
      expect(text).toContain('In your slip')
      expect(text).toContain('Picks 1')
      expect(text).not.toContain('Add to slip')
    }
  })

  it("replaces the market's current pick as the new one goes on, never showing two", async () => {
    const history: string[] = []
    const answer = deferred<boolean>()
    render(
      <CommitHistory history={history}>
        <SlipProvider view={viewOf(YES, pick('o9', 'Other', 'm9'))}>
          <Count />
          <OutcomeSlipControl pick={YES} state="inslip" addAction={vi.fn()} removeAction={vi.fn()} />
          <OutcomeSlipControl pick={NO} state="add" addAction={() => answer.promise} removeAction={vi.fn()} />
        </SlipProvider>
      </CommitHistory>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add to slip No' }))

    expect(screen.getAllByText('In your slip')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Remove No' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to slip Yes' })).toBeInTheDocument()
    expect(screen.getByLabelText('Slip')).toHaveTextContent('Picks 2')
    for (const text of history) expect(countChips(text)).toBeLessThanOrEqual(1)
    // React entangles every pending action, so one left hanging would hold later tests' optimistic state.
    await act(async () => answer.resolve(true))
  })

  it('shows Add to slip disabled, with its reason, when the slip is full', () => {
    render(<OutcomeSlipControl pick={YES} state="disabled" addAction={vi.fn()} removeAction={vi.fn()} disabledReasonId="slip-full-note" />)
    const add = screen.getByRole('button', { name: 'Add to slip Yes' })
    expect(add).toBeDisabled()
    expect(add).toHaveAttribute('aria-describedby', 'slip-full-note')
  })
})
