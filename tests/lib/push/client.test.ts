import { describe, it, expect, vi } from 'vitest'
import { clearAllPushMemory, readPushMemory, resyncPushSubscription, RESYNC_INTERVAL_MS, writePushMemory } from '@/lib/push/client'

// 65 bytes, the length of a real VAPID public key.
const PUBLIC_KEY = Buffer.from(new Uint8Array(65).map((_, i) => i + 1)).toString('base64url')
const KEY = new Uint8Array(65).map((_, i) => i + 1)

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
    data,
  }
}

function fakeSubscription(endpoint: string, key: Uint8Array = KEY) {
  return {
    endpoint,
    options: { applicationServerKey: key.buffer },
    toJSON: () => ({ endpoint, keys: { p256dh: `p-${endpoint}`, auth: `a-${endpoint}` } }),
    unsubscribe: vi.fn(async () => true),
  }
}

const NOW = 1_800_000_000_000

function setup(opts: { existing?: ReturnType<typeof fakeSubscription> | null; memory?: { endpoint: string; syncedAt: number } | null; permission?: NotificationPermission }) {
  const storage = memoryStorage()
  if (opts.memory) writePushMemory(storage, 'u-1', opts.memory)
  const fresh = fakeSubscription('https://fcm.googleapis.com/fcm/send/new')
  const pushManager = {
    getSubscription: vi.fn(async () => opts.existing ?? null),
    subscribe: vi.fn(async () => fresh),
  }
  const save = vi.fn(async () => ({}) as { error?: string })
  const run = () =>
    resyncPushSubscription({
      userId: 'u-1',
      publicKey: PUBLIC_KEY,
      permission: opts.permission ?? 'granted',
      storage,
      now: NOW,
      registration: { pushManager } as never,
      save,
    })
  return { storage, pushManager, save, run, fresh }
}

describe('resyncPushSubscription (#257)', () => {
  it('does nothing without permission, without a memory of turning it on, or without a worker', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/a')
    const memory = { endpoint: existing.endpoint, syncedAt: 0 }
    expect(await setup({ existing, memory, permission: 'default' }).run()).toBe('skipped')
    const noMemory = setup({ existing })
    expect(await noMemory.run()).toBe('skipped')
    expect(noMemory.save).not.toHaveBeenCalled()
    expect(noMemory.pushManager.subscribe).not.toHaveBeenCalled()
    const s = setup({ existing, memory })
    expect(await resyncPushSubscription({ userId: 'u-1', publicKey: PUBLIC_KEY, permission: 'granted', storage: s.storage, now: NOW, registration: null, save: s.save })).toBe('skipped')
  })

  it('leaves a subscription alone that was synced within the day', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/a')
    const t = setup({ existing, memory: { endpoint: existing.endpoint, syncedAt: NOW - 1000 } })
    expect(await t.run()).toBe('fresh')
    expect(t.save).not.toHaveBeenCalled()
  })

  it('saves again a subscription last synced over a day ago', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/a')
    const t = setup({ existing, memory: { endpoint: existing.endpoint, syncedAt: NOW - RESYNC_INTERVAL_MS - 1 } })
    expect(await t.run()).toBe('synced')
    expect(t.save).toHaveBeenCalledWith({ endpoint: existing.endpoint, p256dh: `p-${existing.endpoint}`, auth: `a-${existing.endpoint}` })
    expect(readPushMemory(t.storage, 'u-1')).toEqual({ endpoint: existing.endpoint, syncedAt: NOW })
  })

  it('saves at once a subscription whose endpoint the browser rotated', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/rotated')
    const t = setup({ existing, memory: { endpoint: 'https://fcm.googleapis.com/fcm/send/old', syncedAt: NOW - 1000 } })
    expect(await t.run()).toBe('synced')
    expect(t.save).toHaveBeenCalledTimes(1)
  })

  it('subscribes again and saves when the browser has none (dropped, or pruned and re-made)', async () => {
    const t = setup({ existing: null, memory: { endpoint: 'https://fcm.googleapis.com/fcm/send/old', syncedAt: NOW - 1000 } })
    expect(await t.run()).toBe('resubscribed')
    expect(t.pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    expect(t.save).toHaveBeenCalledWith(expect.objectContaining({ endpoint: t.fresh.endpoint }))
    expect(readPushMemory(t.storage, 'u-1')?.endpoint).toBe(t.fresh.endpoint)
  })

  it('replaces a subscription made with an older VAPID key', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/a', new Uint8Array(65).fill(9))
    const t = setup({ existing, memory: { endpoint: existing.endpoint, syncedAt: NOW - 1000 } })
    expect(await t.run()).toBe('resubscribed')
    expect(existing.unsubscribe).toHaveBeenCalled()
  })

  it('keeps its old memory, to try again next load, when the save fails', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/a')
    const memory = { endpoint: existing.endpoint, syncedAt: NOW - RESYNC_INTERVAL_MS - 1 }
    const t = setup({ existing, memory })
    t.save.mockResolvedValue({ error: 'nope' })
    expect(await t.run()).toBe('failed')
    expect(readPushMemory(t.storage, 'u-1')).toEqual(memory)
    t.save.mockRejectedValue(new Error('offline'))
    expect(await t.run()).toBe('failed')
  })

  it('forgets every member’s memory on sign-out', () => {
    const storage = memoryStorage({ 'dd-push:u-1': '{}', 'dd-push:u-2': '{}', other: 'x' })
    clearAllPushMemory(storage)
    expect([...storage.data.keys()]).toEqual(['other'])
  })
})
