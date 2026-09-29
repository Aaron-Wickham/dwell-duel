// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { RefreshAt } from '@/components/home/refresh-at'

const NOW = Date.parse('2026-09-25T12:00:00Z')
const SECOND = 1000
const DAY = 24 * 60 * 60 * SECOND
const iso = (ms: number) => new Date(ms).toISOString()

let visibility: DocumentVisibilityState = 'visible'
function setVisibility(state: DocumentVisibilityState) {
  visibility = state
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  refresh.mockReset()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('RefreshAt', () => {
  it('refreshes a couple of seconds after the time passes, once', () => {
    render(<RefreshAt at={iso(NOW + 60 * SECOND)} />)
    act(() => vi.advanceTimersByTime(60 * SECOND))
    expect(refresh).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(2 * SECOND))
    expect(refresh).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(DAY))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does nothing without a time', () => {
    render(<RefreshAt at={null} />)
    act(() => vi.advanceTimersByTime(DAY))
    expect(refresh).not.toHaveBeenCalled()
  })

  it('waits for a hidden tab to be shown, then refreshes if the time passed meanwhile', () => {
    render(<RefreshAt at={iso(NOW + 60 * SECOND)} />)
    setVisibility('hidden')
    act(() => vi.advanceTimersByTime(5 * 60 * SECOND))
    expect(refresh).not.toHaveBeenCalled()

    act(() => setVisibility('visible'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('doesn’t refresh early when a hidden tab is shown before the time', () => {
    render(<RefreshAt at={iso(NOW + 60 * SECOND)} />)
    setVisibility('hidden')
    act(() => vi.advanceTimersByTime(10 * SECOND))
    act(() => setVisibility('visible'))
    expect(refresh).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(52 * SECOND))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('reaches a time weeks away in hops, rather than letting setTimeout overflow and fire at once', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    render(<RefreshAt at={iso(NOW + 40 * DAY)} />)
    expect(Math.max(...setTimeoutSpy.mock.calls.map((call) => call[1] ?? 0))).toBeLessThanOrEqual(2 ** 31 - 1)

    act(() => vi.advanceTimersByTime(30 * DAY))
    expect(refresh).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(10 * DAY + 2 * SECOND))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('schedules afresh when the time changes, and stops its timer on unmount', () => {
    const { rerender, unmount } = render(<RefreshAt at={iso(NOW + 60 * SECOND)} />)
    rerender(<RefreshAt at={iso(NOW + 120 * SECOND)} />)
    act(() => vi.advanceTimersByTime(62 * SECOND))
    expect(refresh).not.toHaveBeenCalled()
    unmount()
    act(() => vi.advanceTimersByTime(DAY))
    expect(refresh).not.toHaveBeenCalled()
  })
})
