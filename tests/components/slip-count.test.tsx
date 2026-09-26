// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { startTransition } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlipCountProvider, useSlipCount } from '@/components/app-nav/slip-count'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function Probe({ delta = 1, until = Promise.resolve() }: { delta?: number; until?: Promise<void> }) {
  const { count, adjust } = useSlipCount()
  return (
    <>
      <output aria-label="Slip count">{count}</output>
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            adjust(delta)
            await until
          })
        }
      >
        Adjust
      </button>
    </>
  )
}

describe('SlipCountProvider', () => {
  it('shows the count it was given', () => {
    render(
      <SlipCountProvider initial={3}>
        <Probe />
      </SlipCountProvider>,
    )
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('3')
  })

  it('reads 0, with an adjust that does nothing, outside the signed-in layout', async () => {
    render(<Probe />)
    await userEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('0')
  })

  it('shows an adjustment at once and drops it when the action settles', async () => {
    const gate = deferred()
    render(
      <SlipCountProvider initial={1}>
        <Probe delta={1} until={gate.promise} />
      </SlipCountProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('2')

    await act(async () => gate.resolve())
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('1')
  })

  it('never shows a negative count', async () => {
    const gate = deferred()
    render(
      <SlipCountProvider initial={1}>
        <Probe delta={-3} until={gate.promise} />
      </SlipCountProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('0')

    // React entangles every pending action, so one left hanging would hold later tests' optimistic state.
    await act(async () => gate.resolve())
  })
})
