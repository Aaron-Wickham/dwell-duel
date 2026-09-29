// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { back, push } = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }))
let pathname = '/markets/new'
let depth = 0
vi.mock('next/navigation', () => ({ useRouter: () => ({ back, push }), usePathname: () => pathname }))
vi.mock('@/lib/nav/nav-depth', () => ({ useNavDepth: () => depth }))

import { BackSwipe } from '@/components/nav/back-swipe'

let reduceMotion = false

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  back.mockReset()
  push.mockReset()
  pathname = '/markets/new'
  depth = 0
  reduceMotion = false
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 })
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' && reduceMotion,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})

afterEach(() => {
  vi.useRealTimers()
})

// jsdom's TouchEvent takes plain objects for its touch lists; timeStamp is pinned so the
// release velocity is exact.
function touch(target: Element, type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', x: number, y: number, t: number) {
  const point = { identifier: 1, target, clientX: x, clientY: y }
  const ending = type === 'touchend' || type === 'touchcancel'
  const event = new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: ending ? [] : [point as unknown as Touch],
    changedTouches: [point as unknown as Touch],
  })
  Object.defineProperty(event, 'timeStamp', { value: t })
  target.dispatchEvent(event)
  return event
}

// Moves in 10 steps of 20ms, then lifts after `holdMs`.
function drag(target: Element, from: [number, number], to: [number, number], holdMs = 0) {
  touch(target, 'touchstart', from[0], from[1], 1000)
  const moves: TouchEvent[] = []
  for (let step = 1; step <= 10; step++) {
    const x = from[0] + ((to[0] - from[0]) * step) / 10
    const y = from[1] + ((to[1] - from[1]) * step) / 10
    moves.push(touch(target, 'touchmove', x, y, 1000 + step * 20))
  }
  touch(target, 'touchend', to[0], to[1], 1200 + holdMs)
  return moves
}

function setup() {
  const { rerender, unmount } = render(
    <BackSwipe>
      <h1>Create market</h1>
    </BackSwipe>,
  )
  const heading = screen.getByRole('heading', { name: 'Create market' })
  const content = heading.parentElement!
  const backdrop = content.previousElementSibling as HTMLElement
  const rerenderSameTree = () =>
    rerender(
      <BackSwipe>
        <h1>Create market</h1>
      </BackSwipe>,
    )
  return { heading, content, backdrop, rerenderSameTree, unmount }
}

describe('BackSwipe', () => {
  it('renders its children in a pan-y surface that clips sideways overflow, with a hidden backdrop', () => {
    const { content, backdrop } = setup()
    expect(content.parentElement).toHaveClass('touch-pan-y', 'overflow-x-clip', 'flex-1')
    expect(backdrop).toHaveAttribute('aria-hidden', 'true')
    expect(backdrop).toHaveClass('hidden', 'bg-scrim', 'data-swiping:block')
    expect(content.style.transform).toBe('')
  })

  it('moves the page with the finger over the dimmed backdrop, and stops the page scrolling', () => {
    const { heading, content, backdrop } = setup()
    touch(heading, 'touchstart', 10, 400, 1000)
    const first = touch(heading, 'touchmove', 40, 402, 1020)
    const second = touch(heading, 'touchmove', 160, 405, 1040)

    expect(first.defaultPrevented).toBe(true)
    expect(second.defaultPrevented).toBe(true)
    expect(content).toHaveAttribute('data-swiping')
    expect(backdrop).toHaveAttribute('data-swiping')
    expect(content.style.transform).toBe('translate3d(150px, 0, 0)')
    expect(Number(backdrop.style.opacity)).toBeCloseTo(1 - 150 / 375)
  })

  it('goes to the logical parent with nav-back when there is no in-app history', () => {
    const { heading, content } = setup()
    drag(heading, [5, 400], [200, 410], 200)

    expect(content.style.transform).toBe('translate3d(375px, 0, 0)')
    expect(push).not.toHaveBeenCalled()
    vi.advanceTimersByTime(280)
    expect(push).toHaveBeenCalledWith('/markets', { transitionTypes: ['nav-back'] })
    expect(back).not.toHaveBeenCalled()
  })

  it('goes back through history when the app has some', () => {
    depth = 2
    pathname = '/members/3f2a'
    const { heading } = setup()
    drag(heading, [5, 400], [200, 400], 200)
    vi.advanceTimersByTime(280)

    expect(back).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
  })

  it('springs back from a short, slow drag', () => {
    const { heading, content, backdrop } = setup()
    drag(heading, [5, 400], [80, 400], 200)

    expect(content.style.transform).toBe('translate3d(0px, 0, 0)')
    vi.advanceTimersByTime(280)
    expect(content.style.transform).toBe('')
    expect(content).not.toHaveAttribute('data-swiping')
    expect(backdrop).not.toHaveAttribute('data-swiping')
    expect(push).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  it('completes a short drag that ends in a flick', () => {
    const { heading } = setup()
    // 115px, short of a third of 375, but the last 100ms ran at 0.575 px/ms and the finger lifted at once.
    drag(heading, [5, 400], [120, 400], 0)
    vi.advanceTimersByTime(280)
    expect(push).toHaveBeenCalledWith('/markets', { transitionTypes: ['nav-back'] })
  })

  it('leaves a vertical drag from the edge to the page scroll', () => {
    const { heading, content } = setup()
    const moves = drag(heading, [5, 400], [30, 150], 0)
    vi.advanceTimersByTime(1000)

    expect(moves.every((move) => !move.defaultPrevented)).toBe(true)
    expect(content).not.toHaveAttribute('data-swiping')
    expect(content.style.transform).toBe('')
    expect(push).not.toHaveBeenCalled()
  })

  it('ignores a touch that starts more than 20px from the edge', () => {
    const { heading, content } = setup()
    const moves = drag(heading, [21, 400], [300, 400], 0)
    vi.advanceTimersByTime(1000)

    expect(moves.every((move) => !move.defaultPrevented)).toBe(true)
    expect(content.style.transform).toBe('')
    expect(push).not.toHaveBeenCalled()
  })

  it('ignores a leftward drag and a second finger', () => {
    const { heading, content } = setup()
    drag(heading, [15, 400], [2, 400], 0)
    touch(heading, 'touchstart', 5, 400, 2000)
    touch(heading, 'touchmove', 60, 400, 2020)
    const pinch = new TouchEvent('touchmove', {
      bubbles: true,
      cancelable: true,
      touches: [{ clientX: 60, clientY: 400 }, { clientX: 200, clientY: 300 }] as unknown as Touch[],
    })
    heading.dispatchEvent(pinch)
    vi.advanceTimersByTime(1000)

    expect(content.style.transform).toBe('')
    expect(push).not.toHaveBeenCalled()
  })

  it('never starts while a drawer or dialog is open', () => {
    const { heading, content } = setup()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    try {
      drag(heading, [5, 400], [300, 400], 0)
      vi.advanceTimersByTime(1000)
      expect(content.style.transform).toBe('')
      expect(push).not.toHaveBeenCalled()
    } finally {
      dialog.remove()
    }
  })

  it('springs back when the system cancels the touch', () => {
    const { heading, content } = setup()
    touch(heading, 'touchstart', 5, 400, 1000)
    touch(heading, 'touchmove', 200, 400, 1100)
    touch(heading, 'touchcancel', 200, 400, 1120)
    vi.advanceTimersByTime(280)

    expect(content.style.transform).toBe('')
    expect(push).not.toHaveBeenCalled()
  })

  it('under reduced motion, never moves the page but still completes', () => {
    reduceMotion = true
    const { heading, content, backdrop } = setup()
    touch(heading, 'touchstart', 5, 400, 1000)
    touch(heading, 'touchmove', 200, 400, 1100)
    expect(content.style.transform).toBe('')
    expect(backdrop).not.toHaveAttribute('data-swiping')
    touch(heading, 'touchend', 200, 400, 1300)

    expect(push).toHaveBeenCalledWith('/markets', { transitionTypes: ['nav-back'] })
  })

  it('stops listening once unmounted', () => {
    const { heading, unmount } = setup()
    unmount()
    document.body.append(heading)
    drag(heading, [5, 400], [300, 400], 0)
    vi.advanceTimersByTime(1000)
    expect(push).not.toHaveBeenCalled()
    heading.remove()
  })

  it('resets a completed swipe when the route changes under it, as in the admin layout', () => {
    const { heading, content, backdrop, rerenderSameTree } = setup()
    drag(heading, [5, 400], [200, 410], 200)
    vi.advanceTimersByTime(280)
    expect(push).toHaveBeenCalledTimes(1)
    expect(content.style.transform).toBe('translate3d(375px, 0, 0)')

    // The admin layout's BackSwipe stays mounted across sections; only the pathname changes.
    pathname = '/leaderboard'
    rerenderSameTree()

    expect(content.style.transform).toBe('')
    expect(content).not.toHaveAttribute('data-swiping')
    expect(backdrop).not.toHaveAttribute('data-swiping')

    // `busy` must have cleared too, or this new swipe would be ignored.
    drag(heading, [5, 400], [200, 410], 200)
    vi.advanceTimersByTime(280)
    expect(push).toHaveBeenCalledTimes(2)
  })

  it('does not navigate twice under reduced motion when a second swipe completes before the stuck timer', () => {
    reduceMotion = true
    const { heading } = setup()
    touch(heading, 'touchstart', 5, 400, 1000)
    touch(heading, 'touchmove', 200, 400, 1100)
    touch(heading, 'touchend', 200, 400, 1300)
    expect(push).toHaveBeenCalledTimes(1)

    touch(heading, 'touchstart', 5, 400, 1400)
    touch(heading, 'touchmove', 200, 400, 1500)
    touch(heading, 'touchend', 200, 400, 1700)

    expect(push).toHaveBeenCalledTimes(1)
  })

  it('cancels a swipe in progress when a second finger touches down', () => {
    const { heading, content } = setup()
    touch(heading, 'touchstart', 5, 400, 1000)
    touch(heading, 'touchmove', 200, 400, 1100)
    expect(content).toHaveAttribute('data-swiping')

    const secondFingerDown = new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: [
        { identifier: 1, clientX: 200, clientY: 400 },
        { identifier: 2, clientX: 210, clientY: 400 },
      ] as unknown as Touch[],
    })
    heading.dispatchEvent(secondFingerDown)

    expect(content.style.transform).toBe('')
    expect(content).not.toHaveAttribute('data-swiping')

    // The touch was let go: further moves and the eventual touchend do nothing.
    touch(heading, 'touchmove', 300, 400, 1200)
    touch(heading, 'touchend', 300, 400, 1300)
    vi.advanceTimersByTime(1000)
    expect(content.style.transform).toBe('')
    expect(push).not.toHaveBeenCalled()
  })
})
