import { describe, it, expect, vi, afterEach } from 'vitest'
import { haptics } from '@/lib/haptics'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('haptics', () => {
  it.each([
    ['tap', 10],
    ['success', [15, 60, 15]],
    ['error', [40, 60, 40]],
  ] as const)('%s vibrates with its preset pattern', (preset, pattern) => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })
    haptics[preset]()
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(pattern)
  })

  it('stays still when Vibrate on taps is turned off in Settings', () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })
    vi.stubGlobal('document', { documentElement: { dataset: { haptics: 'off' } } })
    haptics.tap()
    haptics.success()
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('is a silent no-op where the Vibration API is missing, as on iOS', () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone' })
    expect(() => {
      haptics.tap()
      haptics.success()
      haptics.error()
    }).not.toThrow()
  })

  it('is a silent no-op with no navigator at all, as during server rendering', () => {
    vi.stubGlobal('navigator', undefined)
    expect(() => haptics.success()).not.toThrow()
  })
})
