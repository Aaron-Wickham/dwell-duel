// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startTransition, useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlipCountProvider, useSlipCount } from '@/components/app-nav/slip-count'
import { MarketSlipProvider } from '@/components/markets/market-slip'
import { OutcomeSlipControl } from '@/components/markets/outcome-slip-control'
import { CommitHistory } from './commit-history'

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success } }))

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

function Count() {
  return <output aria-label="Slip count">{`Badge ${useSlipCount().count}`}</output>
}

function countChips(text: string): number {
  return text.split('In your slip').length - 1
}

function renderControl(state: 'add' | 'inslip', { count = 0, result }: { count?: number; result: Promise<boolean> }) {
  const action = vi.fn(() => result)
  render(
    <SlipCountProvider initial={count}>
      <Count />
      <OutcomeSlipControl outcomeId="o1" label="Yes" state={state} addAction={action} removeAction={action} />
    </SlipCountProvider>,
  )
  return action
}

describe('OutcomeSlipControl', () => {
  it('flips to In your slip and bumps the nav count before the server answers', async () => {
    const answer = deferred<boolean>()
    const addAction = renderControl('add', { result: answer.promise })

    await userEvent.click(screen.getByRole('button', { name: 'Add to parlay Yes' }))

    expect(addAction).toHaveBeenCalledWith(expect.any(FormData))
    expect(screen.getByText('In your slip')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Yes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to parlay Yes' })).toBeNull()
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('Badge 1')
    expect(success).not.toHaveBeenCalled()

    await act(async () => answer.resolve(true))
    await waitFor(() => expect(success).toHaveBeenCalledWith('Added to your slip.'))
  })

  it('flips back and restores the count when the server makes no change', async () => {
    const answer = deferred<boolean>()
    renderControl('add', { result: answer.promise })

    await userEvent.click(screen.getByRole('button', { name: 'Add to parlay Yes' }))
    expect(screen.getByText('In your slip')).toBeInTheDocument()

    await act(async () => answer.resolve(false))

    expect(screen.getByRole('button', { name: 'Add to parlay Yes' })).toBeInTheDocument()
    expect(screen.queryByText('In your slip')).toBeNull()
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('Badge 0')
    expect(success).not.toHaveBeenCalled()
  })

  it('keeps In your slip on screen while the server state lands, with no flash back to Add', async () => {
    const history: string[] = []
    const answer = deferred<void>()

    function Page() {
      const [slip, setSlip] = useState<string[]>([])
      async function addAction() {
        await answer.promise
        // Next applies the action's refreshed server props in a transition, like this one.
        startTransition(() => setSlip(['o1']))
        return true
      }
      return (
        <SlipCountProvider initial={slip.length}>
          <p>{`Server slip: ${slip.length}`}</p>
          <Count />
          <OutcomeSlipControl
            outcomeId="o1"
            label="Yes"
            state={slip.includes('o1') ? 'inslip' : 'add'}
            addAction={addAction}
            removeAction={vi.fn()}
          />
        </SlipCountProvider>
      )
    }

    render(
      <CommitHistory history={history}>
        <Page />
      </CommitHistory>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add to parlay Yes' }))
    expect(screen.getByText('Server slip: 0')).toBeInTheDocument()
    expect(screen.getByText('In your slip')).toBeInTheDocument()
    const flipped = history.length

    // Not inside act(): React commits the rest in separate tasks, as in a browser, so a
    // flash back to Add would get its own commit in the history.
    answer.resolve()
    await waitFor(() => expect(screen.getByText('Server slip: 1')).toBeInTheDocument())

    expect(screen.getAllByText('In your slip')).toHaveLength(1)
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('Badge 1')
    for (const text of history.slice(flipped - 1)) {
      expect(text).toContain('In your slip')
      expect(text).toContain('Badge 1')
      expect(text).not.toContain('Add to parlay')
    }
  })

  it('flips the market’s current pick off as the new one goes on, and leaves the count alone', async () => {
    const answer = deferred<boolean>()
    const action = vi.fn(() => answer.promise)
    render(
      <SlipCountProvider initial={2}>
        <Count />
        <MarketSlipProvider pick="o1">
          <OutcomeSlipControl outcomeId="o1" label="Yes" state="inslip" addAction={action} removeAction={action} />
          <OutcomeSlipControl outcomeId="o2" label="No" state="add" addAction={action} removeAction={action} />
        </MarketSlipProvider>
      </SlipCountProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add to parlay No' }))

    expect(screen.getAllByText('In your slip')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Remove No' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to parlay Yes' })).toBeInTheDocument()
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('Badge 2')
    // React entangles every pending action, so one left hanging would hold later tests' optimistic state.
    await act(async () => answer.resolve(true))
  })

  it('never shows two In your slip chips for one market while the replacement lands', async () => {
    const history: string[] = []
    const answer = deferred<void>()

    function Market() {
      const [pick, setPick] = useState('o1')
      async function addNo() {
        await answer.promise
        // Next applies the action's refreshed server props in a transition, like this one.
        startTransition(() => setPick('o2'))
        return true
      }
      return (
        <MarketSlipProvider pick={pick}>
          <p>{`Server pick: ${pick}`}</p>
          <OutcomeSlipControl
            outcomeId="o1"
            label="Yes"
            state={pick === 'o1' ? 'inslip' : 'add'}
            addAction={vi.fn()}
            removeAction={vi.fn()}
          />
          <OutcomeSlipControl
            outcomeId="o2"
            label="No"
            state={pick === 'o2' ? 'inslip' : 'add'}
            addAction={addNo}
            removeAction={vi.fn()}
          />
        </MarketSlipProvider>
      )
    }

    render(
      <CommitHistory history={history}>
        <Market />
      </CommitHistory>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add to parlay No' }))
    expect(screen.getByText('Server pick: o1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove No' })).toBeInTheDocument()

    // Not inside act(): React commits the rest in separate tasks, as in a browser.
    answer.resolve()
    await waitFor(() => expect(screen.getByText('Server pick: o2')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: 'Remove No' })).toBeInTheDocument()
    expect(history.length).toBeGreaterThan(2)
    for (const text of history) expect(countChips(text)).toBe(1)
  })

  it('flips Remove back to Add and drops the count before the server answers, and reverts on false', async () => {
    const answer = deferred<boolean>()
    const removeAction = renderControl('inslip', { count: 1, result: answer.promise })

    await userEvent.click(screen.getByRole('button', { name: 'Remove Yes' }))

    expect(removeAction).toHaveBeenCalledWith(expect.any(FormData))
    expect(screen.getByRole('button', { name: 'Add to parlay Yes' })).toBeInTheDocument()
    expect(screen.queryByText('In your slip')).toBeNull()
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('Badge 0')

    await act(async () => answer.resolve(false))

    expect(screen.getByText('In your slip')).toBeInTheDocument()
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('Badge 1')
    expect(success).not.toHaveBeenCalled()
  })

  it('offers no form while the slip is full', () => {
    render(
      <OutcomeSlipControl
        outcomeId="o1"
        label="Yes"
        state="disabled"
        addAction={vi.fn()}
        removeAction={vi.fn()}
        disabledReasonId="slip-full-note"
      />,
    )
    const add = screen.getByRole('button', { name: 'Add to parlay Yes' })
    expect(add).toBeDisabled()
    expect(add).toHaveAttribute('aria-describedby', 'slip-full-note')
    expect(add.closest('form')).toBeNull()
  })
})
