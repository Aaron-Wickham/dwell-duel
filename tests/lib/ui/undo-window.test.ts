// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { UNDO_WINDOW_MS, createUndoWindow, useUndoWindow } from '@/lib/ui/undo-window'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(() => vi.useRealTimers())

// D-7: a held action waits for Undo, then commits exactly once per window.
describe('createUndoWindow', () => {
  it('sends nothing during the window, then commits once when it ends', () => {
    const commit = vi.fn()
    const held = createUndoWindow(commit)
    expect(held.start()).toBe(true)
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1)
    expect(commit).not.toHaveBeenCalled()
    expect(held.isOpen()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(held.isOpen()).toBe(false)
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2)
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('commits nothing after Undo', () => {
    const commit = vi.fn()
    const held = createUndoWindow(commit)
    held.start()
    expect(held.undo()).toBe(true)
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2)
    expect(commit).not.toHaveBeenCalled()
    expect(held.undo()).toBe(false)
  })

  it('commits at once on flush, and never again when the timer would have ended', () => {
    const commit = vi.fn()
    const held = createUndoWindow(commit)
    held.start()
    expect(held.flush()).toBe(true)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(held.flush()).toBe(false)
    vi.advanceTimersByTime(UNDO_WINDOW_MS)
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('ignores a second start while a window is open, so a double tap commits once', () => {
    const commit = vi.fn()
    const held = createUndoWindow(commit)
    held.start()
    vi.advanceTimersByTime(UNDO_WINDOW_MS / 2)
    expect(held.start()).toBe(false)
    vi.advanceTimersByTime(UNDO_WINDOW_MS / 2)
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('does nothing on flush or Undo with no window open, and can open a new one after', () => {
    const commit = vi.fn()
    const held = createUndoWindow(commit)
    expect(held.flush()).toBe(false)
    expect(held.undo()).toBe(false)
    held.start()
    vi.advanceTimersByTime(UNDO_WINDOW_MS)
    expect(held.start()).toBe(true)
    vi.advanceTimersByTime(UNDO_WINDOW_MS)
    expect(commit).toHaveBeenCalledTimes(2)
  })
})

describe('useUndoWindow', () => {
  it('commits for the timer when the window ends', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useUndoWindow(commit))
    act(() => void result.current.start())
    expect(result.current.open).toBe(true)
    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS))
    expect(commit).toHaveBeenCalledExactlyOnceWith('timer')
    expect(result.current.open).toBe(false)
  })

  it('commits at once, as leaving, when it unmounts during the window', () => {
    const commit = vi.fn()
    const { result, unmount } = renderHook(() => useUndoWindow(commit))
    act(() => void result.current.start())
    unmount()
    expect(commit).toHaveBeenCalledExactlyOnceWith('leaving')
    vi.advanceTimersByTime(UNDO_WINDOW_MS)
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('commits nothing on unmount after Undo, or with no window open', () => {
    const commit = vi.fn()
    const { result, unmount } = renderHook(() => useUndoWindow(commit))
    act(() => void result.current.start())
    act(() => void result.current.undo())
    expect(result.current.open).toBe(false)
    unmount()
    vi.advanceTimersByTime(UNDO_WINDOW_MS)
    expect(commit).not.toHaveBeenCalled()
  })

  it('commits as leaving, and asks before the page unloads, during the window', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useUndoWindow(commit))
    act(() => void result.current.start())
    const event = new Event('beforeunload', { cancelable: true })
    act(() => void window.dispatchEvent(event))
    expect(event.defaultPrevented).toBe(true)
    expect(commit).toHaveBeenCalledExactlyOnceWith('leaving')
    act(() => void window.dispatchEvent(new Event('pagehide')))
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('leaves unloading alone with no window open', () => {
    const commit = vi.fn()
    renderHook(() => useUndoWindow(commit))
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(commit).not.toHaveBeenCalled()
  })
})
