// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { savePushSubscriptionAction, deletePushSubscriptionAction, saveNotificationPrefsAction } = vi.hoisted(() => ({
  savePushSubscriptionAction: vi.fn(),
  deletePushSubscriptionAction: vi.fn(),
  saveNotificationPrefsAction: vi.fn(),
}))
vi.mock('@/lib/push/actions', () => ({ savePushSubscriptionAction, deletePushSubscriptionAction, saveNotificationPrefsAction }))

import { NotificationSettings } from '@/app/(app)/settings/notification-settings'
import { DEFAULT_NOTIFICATION_PREFS } from '@/lib/push/prefs'

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/device-1'
// A 65-byte P-256 public key, base64url-encoded, as `web-push generate-vapid-keys` prints one.
const PUBLIC_KEY = 'BA' + 'A'.repeat(85)
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36'
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'

function keyBuffer(): ArrayBuffer {
  const raw = atob((PUBLIC_KEY + '=').replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer
}

function fakeSubscription(endpoint = ENDPOINT) {
  return {
    endpoint,
    options: { applicationServerKey: keyBuffer() },
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
    unsubscribe: vi.fn(async () => true),
  }
}

let existing: ReturnType<typeof fakeSubscription> | null
let permission: NotificationPermission
const pushManager = {
  getSubscription: vi.fn(async () => existing),
  subscribe: vi.fn(async (_options: PushSubscriptionOptionsInit) => (existing = fakeSubscription())),
}
const registration = { pushManager }

function stubBrowser({ push = true, ua = DESKTOP_UA }: { push?: boolean; ua?: string } = {}) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  if (!push) return
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: vi.fn(async () => registration), ready: Promise.resolve(registration) },
  })
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} })
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: {
      get permission() {
        return permission
      },
      requestPermission: vi.fn(async () => permission),
    },
  })
}

function unstubBrowser() {
  for (const key of ['PushManager', 'Notification'] as const) delete (window as unknown as Record<string, unknown>)[key]
  delete (navigator as unknown as Record<string, unknown>).serviceWorker
}

function renderCard(props: Partial<Parameters<typeof NotificationSettings>[0]> = {}) {
  return render(<NotificationSettings publicKey={PUBLIC_KEY} endpoints={[]} prefs={DEFAULT_NOTIFICATION_PREFS} {...props} />)
}

beforeEach(() => {
  existing = null
  permission = 'default'
  pushManager.getSubscription.mockClear()
  pushManager.subscribe.mockClear()
  savePushSubscriptionAction.mockReset().mockResolvedValue({})
  deletePushSubscriptionAction.mockReset().mockResolvedValue({})
  saveNotificationPrefsAction.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  unstubBrowser()
  vi.restoreAllMocks()
})

describe('NotificationSettings', () => {
  it('says notifications aren’t available when the server has no push keys', () => {
    stubBrowser()
    renderCard({ publicKey: null })
    expect(screen.getByText(/Notifications aren’t available here/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).not.toBeInTheDocument()
  })

  it('says so when the browser can’t do push', () => {
    stubBrowser({ push: false })
    renderCard()
    expect(screen.getByText('This browser can’t show notifications from DwellDuel.')).toBeInTheDocument()
  })

  it('points an iPhone in Safari to the Home Screen first', () => {
    stubBrowser({ push: false, ua: IPHONE_UA })
    renderCard()
    expect(screen.getByText(/need DwellDuel on your Home Screen \(iOS 16\.4 or later\)/)).toBeInTheDocument()
  })

  it('explains a blocked permission', async () => {
    stubBrowser()
    permission = 'denied'
    renderCard()
    expect(await screen.findByText(/Notifications are blocked for DwellDuel on this device/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).not.toBeInTheDocument()
  })

  it('turns notifications on: asks, subscribes with the server key and saves the subscription', async () => {
    stubBrowser()
    renderCard()
    permission = 'granted'
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }))

    expect(await screen.findByText('Notifications are on for this device.')).toBeInTheDocument()
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    const { applicationServerKey } = pushManager.subscribe.mock.calls[0][0]
    expect(new Uint8Array(applicationServerKey as Uint8Array)).toEqual(new Uint8Array(keyBuffer()))
    expect(savePushSubscriptionAction).toHaveBeenCalledWith({ endpoint: ENDPOINT, p256dh: 'p256dh-key', auth: 'auth-key' })
  })

  it('stays off, saying why, when the save fails', async () => {
    stubBrowser()
    savePushSubscriptionAction.mockResolvedValue({ error: 'Couldn’t turn on notifications. Check your connection and try again.' })
    renderCard()
    permission = 'granted'
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t turn on notifications')
    expect(screen.getByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument()
  })

  it('shows a denied answer to the permission prompt', async () => {
    stubBrowser()
    renderCard()
    permission = 'denied'
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }))
    expect(await screen.findByText(/Notifications are blocked/)).toBeInTheDocument()
    expect(savePushSubscriptionAction).not.toHaveBeenCalled()
  })

  it('is on when this device’s subscription is saved for the member, and turns off', async () => {
    stubBrowser()
    permission = 'granted'
    const subscription = fakeSubscription()
    existing = subscription
    renderCard({ endpoints: [ENDPOINT] })

    await userEvent.click(await screen.findByRole('button', { name: 'Turn off on this device' }))

    expect(await screen.findByText('Notifications are off on this device.')).toBeInTheDocument()
    expect(deletePushSubscriptionAction).toHaveBeenCalledWith(ENDPOINT)
    expect(subscription.unsubscribe).toHaveBeenCalled()
  })

  it('is off when this device is subscribed for someone else', async () => {
    stubBrowser()
    permission = 'granted'
    existing = fakeSubscription()
    renderCard({ endpoints: ['https://fcm.googleapis.com/fcm/send/other-device'] })
    expect(await screen.findByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument()
  })

  it('shows the four choices with their defaults, new markets off', () => {
    stubBrowser()
    renderCard()
    expect(screen.getByRole('checkbox', { name: 'Markets to resolve' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Results' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Task reviews' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'New markets' })).not.toBeChecked()
  })

  it('saves the choices, and keeps them as ticked when the save fails', async () => {
    stubBrowser({ push: false })
    saveNotificationPrefsAction.mockResolvedValue({ formError: 'Couldn’t save your notification choices.' })
    renderCard()

    await userEvent.click(screen.getByRole('checkbox', { name: 'New markets' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Results' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save choices' }))

    await waitFor(() => expect(saveNotificationPrefsAction).toHaveBeenCalled())
    const form = saveNotificationPrefsAction.mock.calls[0][1] as FormData
    expect(form.get('new_markets')).toBe('on')
    expect(form.get('results')).toBeNull()
    expect(form.get('resolve_reminders')).toBe('on')
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save your notification choices.')
    expect(screen.getByRole('checkbox', { name: 'New markets' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Results' })).not.toBeChecked()
  })
})
