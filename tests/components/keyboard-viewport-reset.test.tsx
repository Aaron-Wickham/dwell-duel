// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { KEYBOARD_SETTLE_MS, KeyboardViewportReset } from '@/components/app-shell/keyboard-viewport-reset'

let standalone = true
let scrollTo: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  standalone = true
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(display-mode: standalone)' && standalone,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  scrollTo = vi.fn()
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 250 })
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

function blurField(field: HTMLElement) {
  field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
}

describe('KeyboardViewportReset (#350)', () => {
  it('re-lays out the fixed bars once the keyboard has gone, without moving the page', () => {
    render(<KeyboardViewportReset />)
    const input = document.createElement('input')
    document.body.append(input)
    blurField(input)

    vi.advanceTimersByTime(KEYBOARD_SETTLE_MS - 1)
    expect(scrollTo).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(scrollTo.mock.calls).toEqual([[{ top: 251, behavior: 'instant' }], [{ top: 250, behavior: 'instant' }]])
  })

  it('leaves the page alone while focus moves on to another field, keeping the keyboard up', () => {
    render(<KeyboardViewportReset />)
    const first = document.createElement('input')
    const next = document.createElement('textarea')
    document.body.append(first, next)
    blurField(first)
    next.focus()
    vi.advanceTimersByTime(KEYBOARD_SETTLE_MS)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('does nothing in a browser tab, where Safari handles the keyboard', () => {
    standalone = false
    render(<KeyboardViewportReset />)
    const input = document.createElement('input')
    document.body.append(input)
    blurField(input)
    vi.advanceTimersByTime(KEYBOARD_SETTLE_MS)
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
