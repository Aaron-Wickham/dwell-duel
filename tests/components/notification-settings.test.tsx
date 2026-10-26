// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { savePushSubscriptionAction, deletePushSubscriptionAction, saveNotificationPrefAction } = vi.hoisted(() => ({
  savePushSubscriptionAction: vi.fn(),
  deletePushSubscriptionAction: vi.fn(),
  saveNotificationPrefAction: vi.fn(),
}))
vi.mock('@/lib/push/actions', () => ({ savePushSubscriptionAction, deletePushSubscriptionAction, saveNotificationPrefAction }))

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

function deferredSave() {
  let resolve!: (value: { error?: string }) => void
  const promise = new Promise<{ error?: string }>((r) => {
    resolve = r
  })
  return { promise, resolve }
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
  return render(<NotificationSettings userId="u-1" publicKey={PUBLIC_KEY} endpoints={[]} prefs={DEFAULT_NOTIFICATION_PREFS} reviewer={false} {...props} />)
}

beforeEach(() => {
  existing = null
  permission = 'default'
  pushManager.getSubscription.mockClear()
  pushManager.subscribe.mockClear()
  savePushSubscriptionAction.mockReset().mockResolvedValue({})
  deletePushSubscriptionAction.mockReset().mockResolvedValue({})
  saveNotificationPrefAction.mockReset().mockResolvedValue({})
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

  it('keeps the button focusable while busy and moves focus to the button that replaces it', async () => {
    stubBrowser()
    renderCard()
    permission = 'granted'
    const turnOn = await screen.findByRole('button', { name: 'Turn on notifications' })
    const saving = deferredSave()
    savePushSubscriptionAction.mockReturnValue(saving.promise)

    await userEvent.click(turnOn)
    // aria-disabled, never the disabled attribute: a disabled button drops focus to <body>.
    await waitFor(() => expect(turnOn).toHaveAttribute('aria-disabled', 'true'))
    expect(turnOn).not.toBeDisabled()
    expect(turnOn).toHaveFocus()
    await userEvent.click(turnOn)
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1)

    saving.resolve({})
    const turnOff = await screen.findByRole('button', { name: 'Turn off on this device' })
    // Focus moves in an effect after the commit that renders the new button, so it can land a
    // tick after findByRole resolves (#360).
    await waitFor(() => expect(turnOff).toHaveFocus())
    expect(turnOff).not.toHaveAttribute('aria-disabled')
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

  it('offers Tasks to review only to a reviewer', () => {
    stubBrowser()
    const { unmount } = renderCard({ prefs: { ...DEFAULT_NOTIFICATION_PREFS, review_alerts: false } })
    expect(screen.queryByRole('checkbox', { name: 'Tasks to review' })).toBeNull()
    unmount()

    renderCard({ reviewer: true })
    expect(screen.getByRole('checkbox', { name: 'Tasks to review' })).toBeChecked()
  })

  // TSK-3: each tick saves itself, like Settings' other switches; there's no Save button.
  it('saves each choice as it is ticked, with no Save button', async () => {
    stubBrowser()
    renderCard()
    await userEvent.click(screen.getByRole('checkbox', { name: 'New markets' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Results' }))

    await waitFor(() => expect(saveNotificationPrefAction).toHaveBeenCalledTimes(2))
    expect(saveNotificationPrefAction.mock.calls).toEqual([
      ['new_markets', true],
      ['results', false],
    ])
    expect(screen.getByRole('checkbox', { name: 'New markets' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Results' })).not.toBeChecked()
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull()
  })

  it('puts a box back and says so when its save fails', async () => {
    stubBrowser()
    saveNotificationPrefAction.mockResolvedValue({ error: 'Couldn’t save that choice. Check your connection and try again.' })
    renderCard()
    const newMarkets = screen.getByRole('checkbox', { name: 'New markets' })
    await userEvent.click(newMarkets)

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save that choice.')
    expect(newMarkets).not.toBeChecked()
    expect(screen.getByRole('group', { name: 'Notify me about' })).toHaveAccessibleDescription(/Couldn’t save that choice/)
  })

  it('puts a box back when the save can’t reach the server', async () => {
    stubBrowser()
    saveNotificationPrefAction.mockRejectedValue(new Error('offline'))
    renderCard()
    const results = screen.getByRole('checkbox', { name: 'Results' })
    await userEvent.click(results)
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your connection')
    expect(results).toBeChecked()
  })

  // #398: the choices can't be changed where notifications can't work, and say why in one line.
  it.each([
    ['the server has no push keys', { publicKey: null }, {}, 'You can choose these on a device that can get notifications.'],
    ['the browser can’t do push', {}, { push: false }, 'You can choose these on a device that can get notifications.'],
    ['an iPhone isn’t on the Home Screen yet', {}, { push: false, ua: IPHONE_UA }, 'You can choose these once DwellDuel is on your Home Screen.'],
  ] as const)('disables the choices when %s', (_case, props, browser, reason) => {
    stubBrowser(browser)
    renderCard(props)
    const newMarkets = screen.getByRole('checkbox', { name: 'New markets' })
    expect(newMarkets).toBeDisabled()
    expect(screen.getByRole('group', { name: 'Notify me about' })).toHaveAccessibleDescription(reason)
  })

  it('disables the choices while notifications are blocked on this device', async () => {
    stubBrowser()
    permission = 'denied'
    renderCard()
    expect(await screen.findByText('You can choose these once notifications are allowed.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Results' })).toBeDisabled()
  })

  // TSK-7: the installed app has no reload button, so the blocked state offers its own re-check.
  it('re-reads a blocked permission from Check again, moving focus to Turn on once it’s allowed', async () => {
    stubBrowser()
    permission = 'denied'
    renderCard()
    const check = await screen.findByRole('button', { name: 'Check again' })

    await userEvent.click(check)
    expect(await screen.findByRole('alert')).toHaveTextContent('Still blocked.')

    permission = 'default'
    await userEvent.click(check)
    const turnOn = await screen.findByRole('button', { name: 'Turn on notifications' })
    await waitFor(() => expect(turnOn).toHaveFocus())
    expect(screen.getByRole('checkbox', { name: 'Results' })).toBeEnabled()
  })

  it('leaves the choices on while this device is off, since they follow the account', async () => {
    stubBrowser()
    renderCard()
    await screen.findByRole('button', { name: 'Turn on notifications' })
    expect(screen.getByRole('checkbox', { name: 'Results' })).toBeEnabled()
    expect(screen.getByText(/These choices follow your account/)).toBeInTheDocument()
  })
})
