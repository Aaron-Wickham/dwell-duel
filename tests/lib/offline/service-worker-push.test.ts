import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Runs the real public/sw.js in a fake worker scope, for its push and notificationclick listeners.
const SOURCE = readFileSync(path.resolve(import.meta.dirname, '../../../public/sw.js'), 'utf8')
const ORIGIN = 'https://www.dwellduel.com'

const newSub = (endpoint: string) => ({ toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }) })

type Listener = (event: unknown) => void
type FakeWindow = { url: string; focus: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn> }

function loadWorker(windows: FakeWindow[] = []) {
  const listeners: Record<string, Listener> = {}
  const showNotification = vi.fn(async (_title: string, _options: NotificationOptions) => undefined)
  const openWindow = vi.fn(async () => null)
  const matchAll = vi.fn(async () => windows)
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true }))
  const subscribe = vi.fn(async (_options: unknown) => newSub('https://fcm.googleapis.com/fcm/send/fresh'))
  const scope: Record<string, unknown> = {
    URL,
    Promise,
    location: { origin: ORIGIN, href: `${ORIGIN}/sw.js?v=v1` },
    fetch: fetchMock,
    registration: { showNotification, pushManager: { subscribe } },
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

  return { dispatch, showNotification, openWindow, matchAll, fetchMock, subscribe }
}

const pushData = (value: unknown) => ({ json: () => value, text: () => JSON.stringify(value) })

function fakeWindow(url: string): FakeWindow {
  return { url, focus: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined) }
}

describe('public/sw.js push', () => {
  it('shows the notification with the app icon and the in-app url', async () => {
    const worker = loadWorker()
    await worker.dispatch('push', {
      data: pushData({ title: 'You won 26 DC', body: 'Will it rain?: No', url: '/markets/m-1' }),
    })
    expect(worker.showNotification).toHaveBeenCalledWith('You won 26 DC', {
      body: 'Will it rain?: No',
      icon: '/android-chrome-192.png',
      badge: '/favicon-48.png',
      data: { url: `${ORIGIN}/markets/m-1` },
    })
  })

  it('never points a notification at another site', async () => {
    const worker = loadWorker()
    await worker.dispatch('push', { data: pushData({ title: 'New market', body: 'x', url: 'https://evil.example/' }) })
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

  // #257: a rotated subscription is re-made with the old key and handed to the server.
  it('resubscribes with the old key and posts the new subscription when the browser rotates it', async () => {
    const worker = loadWorker()
    const key = new Uint8Array([1, 2, 3]).buffer
    await worker.dispatch('pushsubscriptionchange', { oldSubscription: { options: { applicationServerKey: key } }, newSubscription: null })
    expect(worker.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: key })
    expect(worker.fetchMock).toHaveBeenCalledWith('/api/push/resync', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/fcm/send/fresh', p256dh: 'p', auth: 'a' }),
    })
  })

  it('posts the subscription the browser already made, and never throws when the post fails', async () => {
    const worker = loadWorker()
    worker.fetchMock.mockRejectedValue(new Error('offline'))
    await worker.dispatch('pushsubscriptionchange', { newSubscription: newSub('https://fcm.googleapis.com/fcm/send/made') })
    expect(worker.subscribe).not.toHaveBeenCalled()
    expect(worker.fetchMock).toHaveBeenCalledTimes(1)
  })
})
