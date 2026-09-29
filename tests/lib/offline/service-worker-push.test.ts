import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Runs the real public/sw.js in a fake worker scope, for its push and notificationclick listeners.
const SOURCE = readFileSync(path.resolve(import.meta.dirname, '../../../public/sw.js'), 'utf8')
const ORIGIN = 'https://www.dwellduel.com'

type Listener = (event: unknown) => void
type FakeWindow = { url: string; focus: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn> }

function loadWorker(windows: FakeWindow[] = []) {
  const listeners: Record<string, Listener> = {}
  const showNotification = vi.fn(async (_title: string, _options: NotificationOptions) => undefined)
  const openWindow = vi.fn(async () => null)
  const matchAll = vi.fn(async () => windows)
  const scope: Record<string, unknown> = {
    URL,
    Promise,
    location: { origin: ORIGIN, href: `${ORIGIN}/sw.js?v=v1` },
    registration: { showNotification },
    clients: { matchAll, openWindow, claim: vi.fn() },
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener
    },
  }
  scope.self = scope
  vm.runInNewContext(SOURCE, scope)

  async function dispatch(type: string, event: Record<string, unknown>) {
    let done: Promise<unknown> = Promise.resolve()
    listeners[type]({ ...event, waitUntil: (promise: Promise<unknown>) => (done = promise) })
    await done
  }

  return { dispatch, showNotification, openWindow, matchAll }
}

const pushData = (value: unknown) => ({ json: () => value, text: () => JSON.stringify(value) })

function fakeWindow(url: string): FakeWindow {
  return { url, focus: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined) }
}

describe('public/sw.js push', () => {
  it('shows the notification with the app icon and the in-app url', async () => {
    const worker = loadWorker()
    await worker.dispatch('push', {
      data: pushData({ title: 'DwellDuel', body: 'You won 26 DC on Will it rain?', url: '/markets/m-1' }),
    })
    expect(worker.showNotification).toHaveBeenCalledWith('DwellDuel', {
      body: 'You won 26 DC on Will it rain?',
      icon: '/android-chrome-192.png',
      badge: '/favicon-48.png',
      data: { url: `${ORIGIN}/markets/m-1` },
    })
  })

  it('never points a notification at another site', async () => {
    const worker = loadWorker()
    await worker.dispatch('push', { data: pushData({ title: 'DwellDuel', body: 'x', url: 'https://evil.example/' }) })
    expect(worker.showNotification.mock.calls[0][1]).toMatchObject({ data: { url: `${ORIGIN}/` } })
  })

  it('focuses an open window and takes it to the url', async () => {
    const open = fakeWindow(`${ORIGIN}/feed`)
    const worker = loadWorker([open])
    const close = vi.fn()
    await worker.dispatch('notificationclick', { notification: { close, data: { url: `${ORIGIN}/markets/m-1` } } })
    expect(close).toHaveBeenCalled()
    expect(open.focus).toHaveBeenCalled()
    expect(open.navigate).toHaveBeenCalledWith(`${ORIGIN}/markets/m-1`)
    expect(worker.openWindow).not.toHaveBeenCalled()
  })

  it('opens a new window when none is open', async () => {
    const worker = loadWorker([])
    await worker.dispatch('notificationclick', { notification: { close: vi.fn(), data: { url: `${ORIGIN}/tasks` } } })
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/tasks`)
  })
})
