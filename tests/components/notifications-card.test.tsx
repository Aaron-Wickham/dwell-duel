// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DevicePush } from '@/lib/push/use-device-push'

let push: DevicePush = 'off'
vi.mock('@/lib/push/use-device-push', () => ({ useDevicePush: () => push }))

import { NotificationsCard, NOTIFICATIONS_CARD_DISMISSED_KEY } from '@/components/home/notifications-card'

function setStandalone(standalone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query === '(display-mode: standalone)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

// Newer Node versions define their own global localStorage, which shadows jsdom's, as in
// install-card.test.tsx.
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
}

beforeEach(() => {
  push = 'off'
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('NotificationsCard (#260)', () => {
  it('asks the installed app with no push subscription to turn notifications on, in Settings', () => {
    setStandalone(true)
    render(<NotificationsCard onboardingShown={false} />)
    expect(screen.getByRole('region', { name: 'Turn on notifications' })).toHaveTextContent(
      'Know when a market you made closes, and when your bets pay.',
    )
    expect(screen.getByRole('link', { name: 'Turn on' })).toHaveAttribute('href', '/settings#settings-notifications')
  })

  it.each([
    ['in a browser tab, where Get the app shows instead', { standalone: false, push: 'off', onboarding: false }],
    ['once this device has push', { standalone: true, push: 'on', onboarding: false }],
    ['while it is still checking', { standalone: true, push: 'checking', onboarding: false }],
    ['where this browser can never get push', { standalone: true, push: 'unsupported', onboarding: false }],
    ['while Getting started is up, which asks itself', { standalone: true, push: 'off', onboarding: true }],
  ] as const)('stays away %s', (_, c) => {
    setStandalone(c.standalone)
    push = c.push
    const { container } = render(<NotificationsCard onboardingShown={c.onboarding} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('remembers Not now, and moves focus to the page heading', async () => {
    setStandalone(true)
    const { unmount } = render(
      <>
        <h1>Welcome back</h1>
        <NotificationsCard onboardingShown={false} />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region', { name: 'Turn on notifications' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    expect(localStorage.getItem(NOTIFICATIONS_CARD_DISMISSED_KEY)).toBe('1')
    unmount()

    const { container } = render(<NotificationsCard onboardingShown={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
