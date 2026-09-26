'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react'
import type { LiveSubscription } from './live-refresh'

function entryId(subscription: LiveSubscription): string {
  return `${subscription.table}|${subscription.filter ?? ''}`
}

function dedupeSorted(subscriptions: LiveSubscription[]): LiveSubscription[] {
  const byId = new Map<string, LiveSubscription>()
  for (const subscription of subscriptions) byId.set(entryId(subscription), subscription)
  return [...byId.values()].sort((a, b) => {
    const idA = entryId(a)
    const idB = entryId(b)
    return idA < idB ? -1 : idA > idB ? 1 : 0
  })
}

export function subscriptionKey(subscriptions: LiveSubscription[]): string {
  return dedupeSorted(subscriptions).map(entryId).join(',')
}

// A plain external store, not React state: every page's <LiveTables> registers into it from an
// effect, and LiveRefresh (and any other reader) subscribes with useSyncExternalStore. That keeps
// registration out of the render path entirely -- no setState-in-effect, no extra render per page.
class LiveTableRegistry {
  private readonly base: LiveSubscription
  private readonly registered = new Map<string, LiveSubscription[]>()
  private readonly listeners = new Set<() => void>()
  private snapshot: LiveSubscription[]

  constructor(userId: string) {
    this.base = { table: 'profiles', filter: `id=eq.${userId}` }
    this.snapshot = dedupeSorted([this.base])
  }

  register(key: string, subscriptions: LiveSubscription[]): void {
    this.registered.set(key, subscriptions)
    this.recompute()
  }

  unregister(key: string): void {
    if (!this.registered.delete(key)) return
    this.recompute()
  }

  private recompute(): void {
    this.snapshot = dedupeSorted([this.base, ...this.registered.values()].flat())
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): LiveSubscription[] => this.snapshot
}

const LiveTablesContext = createContext<LiveTableRegistry | null>(null)

export function LiveTablesProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const registry = useMemo(() => new LiveTableRegistry(userId), [userId])
  return <LiveTablesContext value={registry}>{children}</LiveTablesContext>
}

const NO_SUBSCRIPTIONS: LiveSubscription[] = []
const subscribeToNothing = () => () => {}
const getNoSubscriptions = () => NO_SUBSCRIPTIONS

export function useLiveSubscriptions(): LiveSubscription[] {
  const registry = useContext(LiveTablesContext)
  return useSyncExternalStore(
    registry ? registry.subscribe : subscribeToNothing,
    registry ? registry.getSnapshot : getNoSubscriptions,
    registry ? registry.getSnapshot : getNoSubscriptions,
  )
}

let nextRegistrationId = 0

export function LiveTables({ subscriptions }: { subscriptions: LiveSubscription[] }): null {
  const registry = useContext(LiveTablesContext)
  const key = subscriptionKey(subscriptions)
  const idRef = useRef<string | undefined>(undefined)
  if (idRef.current === undefined) idRef.current = `live-tables:${++nextRegistrationId}`

  useEffect(() => {
    if (!registry) return
    const id = idRef.current!
    registry.register(id, subscriptions)
    return () => registry.unregister(id)
    // The key, not the subscriptions array, is the real dependency: a server component hands this
    // component a new array every render even when its tables and filters haven't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, key])

  return null
}
