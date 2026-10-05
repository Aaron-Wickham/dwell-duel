// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startTransition, useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlipProvider, useSlip } from '@/components/slip/slip-provider'
import { OutcomeRow } from '@/components/markets/outcome-row'
import type { OutcomeRowState } from '@/lib/markets/row-state'
import { EMPTY_SLIP, type SlipPick, type SlipView } from '@/lib/parlays/get-slip'
import { CommitHistory } from './commit-history'

const { success, error } = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success, error } }))
vi.mock('@/lib/parlays/slip-actions', () => ({ setPickModeAction: vi.fn() }))

beforeEach(() => {
  success.mockReset()
  error.mockReset()
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
  lmsr: { q: [0, 0], index: 0, liquidity: 50 },
})
const YES = pick('o1', 'Yes')
const NO = pick('o2', 'No')
const viewOf = (...picks: SlipPick[]): SlipView => ({ ...EMPTY_SLIP, picks })

function Count() {
  const { picks, open } = useSlip()
  return <output aria-label="Slip">{`Picks ${picks.length}${open ? ' · open' : ''}`}</output>
}

type SlipAction = Parameters<typeof OutcomeRow>[0]['addAction']

// The control lives in its outcome row, which says "In your slip" beside it.
function Row({
  pick,
  state,
  addAction,
  removeAction,
  disabledReasonId,
}: {
  pick: SlipPick
  state: Exclude<OutcomeRowState, 'none'>
  addAction: SlipAction
  removeAction: SlipAction
  disabledReasonId?: string
}) {
  return (
    <OutcomeRow
      label={pick.outcomeLabel}
      probability={0.5}
      pays={20}
      state={state}
      slipPick={pick}
      addAction={addAction}
      removeAction={removeAction}
      disabledReasonId={disabledReasonId}
    />
  )
}

function countChips(text: string): number {
  return text.split('In your slip').length - 1
}

describe('OutcomeSlipControl, in its row', () => {
  it('flips to In your slip and adds the pick to the slip before the server answers', async () => {
    const answer = deferred<boolean>()
    const addAction = vi.fn(() => answer.promise)
    render(
      <SlipProvider view={viewOf()}>
        <Count />
        <Row pick={YES} state="add" addAction={addAction} removeAction={vi.fn()} />
      </SlipProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add Yes to slip' }))

    expect(addAction).toHaveBeenCalledWith(expect.any(FormData))
    expect(screen.getByText('In your slip')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Yes from slip' })).toBeInTheDocument()
    expect(screen.getByLabelText('Slip')).toHaveTextContent('Picks 1')
    expect(success).not.toHaveBeenCalled()

    // The row's change and the slip button say it; no toast (#392).
    await act(async () => answer.resolve(true))
    expect(success).not.toHaveBeenCalled()
  })

  it('keeps keyboard focus on the control that replaces Add (A11Y-02)', async () => {
    const answer = deferred<boolean>()
    render(
      <SlipProvider view={viewOf()}>
        <Row pick={YES} state="add" addAction={() => answer.promise} removeAction={vi.fn()} />
      </SlipProvider>,
    )
    screen.getByRole('button', { name: 'Add Yes to slip' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Remove Yes from slip' })).toHaveFocus()
    await act(async () => answer.resolve(true))
  })

  it('gives focus back to the row’s control when the server’s refresh remounts the row', async () => {
    const answer = deferred<void>()
    function Page() {
      const [view, setView] = useState(viewOf())
      async function addAction() {
        await answer.promise
        startTransition(() => setView(viewOf(YES)))
        return true
      }
      // A new key stands in for a refresh that rebuilds the outcome list.
      return (
        <SlipProvider view={view}>
          <Row key={view.picks.length} pick={YES} state="add" addAction={addAction} removeAction={vi.fn()} />
        </SlipProvider>
      )
    }
    render(<Page />)
    screen.getByRole('button', { name: 'Add Yes to slip' }).focus()
    await userEvent.keyboard('{Enter}')
    await act(async () => answer.resolve())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Yes from slip' })).toHaveFocus())
  })

  it('flips back when the server makes no change', async () => {
    const answer = deferred<boolean>()
    render(
      <SlipProvider view={viewOf()}>
        <Count />
        <Row pick={YES} state="add" addAction={() => answer.promise} removeAction={vi.fn()} />
      </SlipProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add Yes to slip' }))
    expect(screen.getByText('In your slip')).toBeInTheDocument()

    await act(async () => answer.resolve(false))

    expect(screen.getByRole('button', { name: 'Add Yes to slip' })).toBeInTheDocument()
    expect(screen.getByLabelText('Slip')).toHaveTextContent('Picks 0')
    expect(success).not.toHaveBeenCalled()
  })

  it('flips back and says why when the slip filled up elsewhere (#221)', async () => {
    const answer = deferred<{ error: string }>()
    render(
      <SlipProvider view={viewOf()}>
        <Count />
        <Row pick={YES} state="add" addAction={() => answer.promise} removeAction={vi.fn()} />
      </SlipProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add Yes to slip' }))
    expect(screen.getByText('In your slip')).toBeInTheDocument()

    await act(async () => answer.resolve({ error: 'Your slip is full (10 picks). Place or remove some to add more.' }))

    expect(screen.getByRole('button', { name: 'Add Yes to slip' })).toBeInTheDocument()
    expect(screen.getByLabelText('Slip')).toHaveTextContent('Picks 0')
    expect(error).toHaveBeenCalledWith('Your slip is full (10 picks). Place or remove some to add more.')
    expect(success).not.toHaveBeenCalled()
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
          <Row pick={YES} state="add" addAction={addAction} removeAction={vi.fn()} />
        </SlipProvider>
      )
    }

    render(
      <CommitHistory history={history}>
        <Page />
      </CommitHistory>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add Yes to slip' }))
    expect(screen.getByText('Server slip: 0')).toBeInTheDocument()
    expect(screen.getByText('In your slip')).toBeInTheDocument()
    const flipped = history.length

    // Not inside act(): React commits the rest in separate tasks, as in a browser.
    answer.resolve()
    await waitFor(() => expect(screen.getByText('Server slip: 1')).toBeInTheDocument())

    for (const text of history.slice(flipped - 1)) {
      expect(text).toContain('In your slip')
      expect(text).toContain('Picks 1')
      expect(text).not.toContain('Add Yes to slip')
    }
  })

  it("replaces the market's current pick as the new one goes on, never showing two", async () => {
    const history: string[] = []
    const answer = deferred<boolean>()
    render(
      <CommitHistory history={history}>
        <SlipProvider view={viewOf(YES, pick('o9', 'Other', 'm9'))}>
          <Count />
          <Row pick={YES} state="inslip" addAction={vi.fn()} removeAction={vi.fn()} />
          <Row pick={NO} state="add" addAction={() => answer.promise} removeAction={vi.fn()} />
        </SlipProvider>
      </CommitHistory>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add No to slip' }))

    expect(screen.getAllByText('In your slip')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Remove No from slip' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Yes to slip' })).toBeInTheDocument()
    expect(screen.getByLabelText('Slip')).toHaveTextContent('Picks 2')
    for (const text of history) expect(countChips(text)).toBeLessThanOrEqual(1)
    // React entangles every pending action, so one left hanging would hold later tests' optimistic state.
    await act(async () => answer.resolve(true))
  })

  it('shows Add disabled, with its reason, when the slip is full', () => {
    render(<Row pick={YES} state="disabled" addAction={vi.fn()} removeAction={vi.fn()} disabledReasonId="slip-full-note" />)
    const add = screen.getByRole('button', { name: 'Add Yes to slip' })
    expect(add).toBeDisabled()
    expect(add).toHaveAttribute('aria-describedby', 'slip-full-note')
  })
})
