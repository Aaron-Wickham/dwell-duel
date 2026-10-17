// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { KEYBOARD_MIN_HEIGHT, KeyboardOpenFlag, nextKeyboardOpen } from '@/components/app-shell/keyboard-open'

describe('nextKeyboardOpen (#443)', () => {
  it('opens when a field has focus and the viewport has shrunk by a keyboard', () => {
    expect(nextKeyboardOpen(false, 800, 800 - KEYBOARD_MIN_HEIGHT, true)).toBe(true)
  })

  it('stays closed for focus alone, as with a hardware keyboard', () => {
    expect(nextKeyboardOpen(false, 800, 800, true)).toBe(false)
  })

  it("stays closed when only Safari's toolbar changes the height", () => {
    expect(nextKeyboardOpen(false, 800, 720, true)).toBe(false)
  })

  it('stays open after the field loses focus until the viewport grows back', () => {
    expect(nextKeyboardOpen(true, 800, 500, false)).toBe(true)
    expect(nextKeyboardOpen(true, 800, 800, false)).toBe(false)
  })

  it("doesn't open for a shrunk viewport with nothing focused", () => {
    expect(nextKeyboardOpen(false, 800, 400, false)).toBe(false)
  })
})

class FakeViewport extends EventTarget {
  width = 390
  height = 760
  scale = 1
  offsetTop = 0
}

describe('KeyboardOpenFlag', () => {
  let viewport: FakeViewport

  beforeEach(() => {
    viewport = new FakeViewport()
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  function resize(height: number) {
    viewport.height = height
    viewport.dispatchEvent(new Event('resize'))
  }

  it('marks the page while the keyboard is up, and clears it once the keyboard has gone', () => {
    render(<KeyboardOpenFlag />)
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    expect(document.documentElement.dataset.keyboard).toBeUndefined()

    resize(420)
    expect(document.documentElement.dataset.keyboard).toBe('open')

    input.blur()
    expect(document.documentElement.dataset.keyboard).toBe('open')
    resize(760)
    expect(document.documentElement.dataset.keyboard).toBeUndefined()
  })

  it('ignores pinch-zoom, which shrinks the viewport in CSS pixels only', () => {
    render(<KeyboardOpenFlag />)
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    viewport.scale = 2
    resize(380)
    expect(document.documentElement.dataset.keyboard).toBeUndefined()
  })

  it('carries the iOS pan of the visible area while the keyboard is up, and drops it after (#487)', () => {
    render(<KeyboardOpenFlag />)
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    viewport.offsetTop = 64
    resize(420)
    expect(document.documentElement.style.getPropertyValue('--vv-top')).toBe('64px')
    viewport.offsetTop = 90
    viewport.dispatchEvent(new Event('scroll'))
    expect(document.documentElement.style.getPropertyValue('--vv-top')).toBe('90px')
    input.blur()
    viewport.offsetTop = 0
    resize(760)
    expect(document.documentElement.style.getPropertyValue('--vv-top')).toBe('')
  })
})
