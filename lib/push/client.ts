import type { SubscriptionInput } from './subscription'

export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false
  const view = new Uint8Array(a)
  return view.every((byte, i) => byte === b[i])
}

// What this browser remembers about having turned notifications on for one member, so a
// subscription the browser dropped or the server pruned can be put back without asking again, and
// without ever turning them on for a member who didn't (a shared phone, or one who turned them off).
export interface PushMemory {
  endpoint: string
  syncedAt: number
}

const memoryKey = (userId: string) => `dd-push:${userId}`

export function readPushMemory(storage: Pick<Storage, 'getItem'>, userId: string): PushMemory | null {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(memoryKey(userId)) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return null
    const { endpoint, syncedAt } = parsed as Record<string, unknown>
    return typeof endpoint === 'string' && typeof syncedAt === 'number' ? { endpoint, syncedAt } : null
  } catch {
    return null
  }
}

export function writePushMemory(storage: Pick<Storage, 'setItem' | 'removeItem'>, userId: string, memory: PushMemory | null): void {
  try {
    if (memory) storage.setItem(memoryKey(userId), JSON.stringify(memory))
    else storage.removeItem(memoryKey(userId))
  } catch {
    // Private windows and blocked storage: re-sync just has nothing to go on.
  }
}

// Signing out forgets every member's memory on this device, so the next person to sign in on a
// shared phone isn't subscribed by it.
export function clearAllPushMemory(storage: Pick<Storage, 'key' | 'length' | 'removeItem'>): void {
  try {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k) => k?.startsWith('dd-push:'))
    for (const key of keys) storage.removeItem(key as string)
  } catch {
    // Storage blocked: nothing was remembered either.
  }
}

// Even a subscription the server already has is saved again this often, which also clears a
// failure streak (0076) for a device that is fine.
export const RESYNC_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface ResyncDeps {
  userId: string
  publicKey: string
  permission: NotificationPermission
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  now: number
  registration: Pick<ServiceWorkerRegistration, 'pushManager'> | null
  save: (subscription: Partial<SubscriptionInput>) => Promise<{ error?: string }>
}

export type ResyncOutcome = 'skipped' | 'fresh' | 'synced' | 'resubscribed' | 'failed'

// Keeps the server's copy of this device's subscription true (#257). Browsers rotate and expire
// subscriptions, the server deletes one that keeps failing, and either ends notifications with no
// sign. Runs on load for a member who turned them on here: a subscription with a key this server
// no longer uses, or none at all, is replaced; one the server was last told about over a day ago, or
// that has a new endpoint, is saved again.
export async function resyncPushSubscription(deps: ResyncDeps): Promise<ResyncOutcome> {
  const { userId, publicKey, permission, storage, now, registration, save } = deps
  const memory = readPushMemory(storage, userId)
  if (permission !== 'granted' || !memory || !registration) return 'skipped'

  try {
    const key = keyBytes(publicKey)
    let subscription = await registration.pushManager.getSubscription()
    let replaced = false
    if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
      await subscription.unsubscribe()
      subscription = null
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      replaced = true
    }
    if (!replaced && subscription.endpoint === memory.endpoint && now - memory.syncedAt < RESYNC_INTERVAL_MS) return 'fresh'

    const { endpoint, keys } = subscription.toJSON()
    const result = await save({ endpoint, p256dh: keys?.p256dh, auth: keys?.auth })
    if (result.error) return 'failed'
    writePushMemory(storage, userId, { endpoint: subscription.endpoint, syncedAt: now })
    return replaced ? 'resubscribed' : 'synced'
  } catch {
    return 'failed'
  }
}
