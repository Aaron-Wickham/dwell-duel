// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { signOut, deletePushSubscriptionAction } = vi.hoisted(() => ({ signOut: vi.fn(), deletePushSubscriptionAction: vi.fn() }))
vi.mock('@/lib/auth/sign-out', () => ({ signOut }))
vi.mock('@/lib/push/actions', () => ({ deletePushSubscriptionAction }))

import { SignOutButton } from '@/app/(app)/settings/sign-out-button'

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/device-1'

function fakeSubscription() {
  return { endpoint: ENDPOINT, unsubscribe: vi.fn(async () => true) }
}

function stubServiceWorker(subscription: ReturnType<typeof fakeSubscription> | null) {
  const registration = { pushManager: { getSubscription: vi.fn(async () => subscription) } }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: vi.fn(async () => registration) },
  })
}

beforeEach(() => {
  signOut.mockReset().mockResolvedValue(undefined)
  deletePushSubscriptionAction.mockReset().mockResolvedValue({})
})

afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).serviceWorker
  vi.restoreAllMocks()
})

describe('SignOutButton (#194)', () => {
  it('deletes this device’s push subscription, unsubscribes the browser, then signs out', async () => {
    const subscription = fakeSubscription()
    stubServiceWorker(subscription)
    render(<SignOutButton />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(signOut).toHaveBeenCalledOnce())
    expect(deletePushSubscriptionAction).toHaveBeenCalledWith(ENDPOINT)
    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
    expect(deletePushSubscriptionAction.mock.invocationCallOrder[0]).toBeLessThan(subscription.unsubscribe.mock.invocationCallOrder[0])
    expect(subscription.unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0])
  })

  it('signs out a device that never subscribed without touching the server', async () => {
    stubServiceWorker(null)
    render(<SignOutButton />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(signOut).toHaveBeenCalledOnce())
    expect(deletePushSubscriptionAction).not.toHaveBeenCalled()
  })

  it('signs out a browser with no service worker at all', async () => {
    render(<SignOutButton />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(signOut).toHaveBeenCalledOnce())
    expect(deletePushSubscriptionAction).not.toHaveBeenCalled()
  })

  it('still unsubscribes and signs out when deleting the row fails', async () => {
    const subscription = fakeSubscription()
    stubServiceWorker(subscription)
    deletePushSubscriptionAction.mockRejectedValue(new Error('offline'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<SignOutButton />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(signOut).toHaveBeenCalledOnce())
    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith('Stopping notifications on sign-out failed', expect.any(Error))
  })
})
