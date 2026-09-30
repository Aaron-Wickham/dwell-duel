// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlipProvider, useSlip } from '@/components/slip/slip-provider'
import { EMPTY_SLIP } from '@/lib/parlays/get-slip'

vi.mock('@/lib/parlays/slip-actions', () => ({ setPickModeAction: vi.fn() }))

let nextKey = 0

// Stands in for the slip panel: it lives inside the sheet's portal, which unmounts it on close.
// Each "Place" keeps the key it finds, or mints one, the way the real panel does.
function Panel({ sent }: { sent: string[] }) {
  const { attemptKeyRef, lostResponse, setLostResponse, setStake, stakes, clearStakes } = useSlip()
  return (
    <div>
      <output aria-label="Lost">{String(lostResponse)}</output>
      <output aria-label="Stake">{stakes.o1 ?? ''}</output>
      <button
        type="button"
        onClick={() => {
          attemptKeyRef.current ??= `key-${++nextKey}`
          sent.push(attemptKeyRef.current)
          setLostResponse(true)
          setStake('o1', '7')
        }}
      >
        Place
      </button>
      <button type="button" onClick={clearStakes}>
        Succeed
      </button>
    </div>
  )
}

function Layout({ sent }: { sent: string[] }) {
  const [open, setOpen] = useState(true)
  return (
    <SlipProvider view={EMPTY_SLIP}>
      <button type="button" onClick={() => setOpen((o) => !o)}>
        Toggle sheet
      </button>
      {open && <Panel sent={sent} />}
    </SlipProvider>
  )
}

beforeEach(() => {
  nextKey = 0
})

describe('SlipProvider retry state (#192)', () => {
  it('keeps the attempt key and the lost-response flag while the panel is unmounted', async () => {
    const sent: string[] = []
    render(<Layout sent={sent} />)
    await userEvent.click(screen.getByRole('button', { name: 'Place' }))
    expect(screen.getByLabelText('Lost')).toHaveTextContent('true')

    await userEvent.click(screen.getByRole('button', { name: 'Toggle sheet' }))
    expect(screen.queryByLabelText('Lost')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Toggle sheet' }))

    expect(screen.getByLabelText('Lost')).toHaveTextContent('true')
    expect(screen.getByLabelText('Stake')).toHaveTextContent('7')
    await userEvent.click(screen.getByRole('button', { name: 'Place' }))
    expect(sent).toEqual(['key-1', 'key-1'])
  })

  it('clears the key and the flag with the stakes once a place succeeds', async () => {
    const sent: string[] = []
    render(<Layout sent={sent} />)
    await userEvent.click(screen.getByRole('button', { name: 'Place' }))
    await userEvent.click(screen.getByRole('button', { name: 'Succeed' }))

    expect(screen.getByLabelText('Lost')).toHaveTextContent('false')
    expect(screen.getByLabelText('Stake')).toHaveTextContent('')
    await userEvent.click(screen.getByRole('button', { name: 'Place' }))
    expect(sent).toEqual(['key-1', 'key-2'])
  })
})
