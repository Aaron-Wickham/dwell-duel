// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import Link from 'next/link'
import { CardLinkClick } from '@/components/ui/card-link-click'

function Card() {
  return (
    <>
      <CardLinkClick />
      <div className="pressable relative" data-testid="card">
        <Link href="/markets/m1" className="stretched-link" onClick={(e) => e.preventDefault()}>
          Who wins?
        </Link>
        <p>Closes soon</p>
        <button type="button">Bet</button>
      </div>
      <p data-testid="outside">Not in a card</p>
    </>
  )
}

let fine = true
beforeEach(() => {
  fine = true
  push.mockReset()
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(pointer: fine)' ? fine : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})
afterEach(() => {
  window.getSelection()?.removeAllRanges()
  vi.restoreAllMocks()
})

describe('CardLinkClick', () => {
  it('opens the card on a plain click in its text', () => {
    render(<Card />)
    fireEvent.click(screen.getByText('Closes soon'))
    expect(push).toHaveBeenCalledWith('/markets/m1', { transitionTypes: ['nav-forward'] })
  })

  // #384: the card dims until its page arrives; router.push here resolves at once.
  it('marks the clicked card pending while its page is on the way', async () => {
    render(<Card />)
    const card = screen.getByTestId('card')
    // Each change's previous value: none before it's set, '' before it's removed.
    const before: (string | null)[] = []
    const observer = new MutationObserver((records) => before.push(...records.map((record) => record.oldValue)))
    observer.observe(card, { attributes: true, attributeFilter: ['data-card-pending'], attributeOldValue: true })
    fireEvent.click(screen.getByText('Closes soon'))
    await vi.waitFor(() => expect(before).toEqual([null, '']))
    expect(card).not.toHaveAttribute('data-card-pending')
    observer.disconnect()
  })

  it('leaves a click after a text selection in the card alone', () => {
    render(<Card />)
    const text = screen.getByText('Closes soon')
    window.getSelection()!.selectAllChildren(text)
    fireEvent.click(text)
    expect(push).not.toHaveBeenCalled()
  })

  it('still opens the card when the selection is elsewhere', () => {
    render(<Card />)
    window.getSelection()!.selectAllChildren(screen.getByTestId('outside'))
    fireEvent.click(screen.getByText('Closes soon'))
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('leaves a click on an inner control or the link itself to that control', () => {
    render(<Card />)
    fireEvent.click(screen.getByRole('button', { name: 'Bet' }))
    fireEvent.click(screen.getByRole('link', { name: 'Who wins?' }))
    expect(push).not.toHaveBeenCalled()
  })

  it('ignores clicks outside a card', () => {
    render(<Card />)
    fireEvent.click(screen.getByTestId('outside'))
    expect(push).not.toHaveBeenCalled()
  })

  it('opens a new tab on cmd/ctrl-click and middle click', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<Card />)
    const text = screen.getByText('Closes soon')
    fireEvent.click(text, { metaKey: true })
    fireEvent.click(text, { ctrlKey: true })
    fireEvent(text, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }))
    expect(open).toHaveBeenCalledTimes(3)
    expect(open).toHaveBeenCalledWith(expect.stringContaining('/markets/m1'), '_blank')
    expect(push).not.toHaveBeenCalled()
  })

  it('does nothing on touch, where the link’s cover handles the tap', () => {
    fine = false
    render(<Card />)
    fireEvent.click(screen.getByText('Closes soon'))
    expect(push).not.toHaveBeenCalled()
  })
})
