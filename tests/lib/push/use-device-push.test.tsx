// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDevicePush } from '@/lib/push/use-device-push'

function setDevice({ permission, subscribed }: { permission: NotificationPermission; subscribed: boolean }) {
  vi.stubGlobal('Notification', { permission })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => (subscribed ? {} : null) } }) },
  })
}

afterEach(() => {
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

  it('is off where there is no service worker at all', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' })
    const { result } = renderHook(() => useDevicePush())
    await waitFor(() => expect(result.current).toBe('off'))
  })
})
