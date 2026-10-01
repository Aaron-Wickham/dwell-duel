// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDevicePush } from '@/lib/push/use-device-push'

function setDevice({ permission, subscribed }: { permission: NotificationPermission; subscribed: boolean }) {
  vi.stubGlobal('Notification', { permission })
  vi.stubGlobal('PushManager', function PushManager() {})
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => (subscribed ? {} : null) } }) },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('useDevicePush', () => {
  it('is on with permission and a subscription', async () => {
    setDevice({ permission: 'granted', subscribed: true })
    const { result } = renderHook(() => useDevicePush())
    expect(result.current).toBe('checking')
    await waitFor(() => expect(result.current).toBe('on'))
  })

  it.each([
    ['without a subscription', { permission: 'granted', subscribed: false }],
    ['without permission', { permission: 'default', subscribed: true }],
  ] as const)('is off %s', async (_, device) => {
    setDevice(device)
    const { result } = renderHook(() => useDevicePush())
    await waitFor(() => expect(result.current).toBe('off'))
  })

  it('is unsupported where this browser has no push at all', async () => {
    vi.stubGlobal('Notification', { permission: 'default' })
    const { result } = renderHook(() => useDevicePush())
    await waitFor(() => expect(result.current).toBe('unsupported'))
  })

  it('is off, not unsupported, in iPhone Safari before the app is installed, since installing turns it on', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) Safari/604.1')
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
    const { result } = renderHook(() => useDevicePush())
    await waitFor(() => expect(result.current).toBe('off'))
  })

  it('is off when permission is blocked, so the step stays and Settings explains', async () => {
    setDevice({ permission: 'denied', subscribed: false })
    const { result } = renderHook(() => useDevicePush())
    await waitFor(() => expect(result.current).toBe('off'))
  })
})
