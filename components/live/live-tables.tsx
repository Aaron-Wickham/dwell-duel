'use client'

import { createContext, useContext, useEffect, useId, useMemo, useSyncExternalStore, type ReactNode } from 'react'
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
// effect, and readers subscribe with useSyncExternalStore. That keeps registration out of the
// render path entirely -- no setState-in-effect, no extra render per page.
class LiveTableRegistry {
  readonly base: LiveSubscription
  private readonly registered = new Map<string, LiveSubscription[]>()
  private readonly listeners = new Set<() => void>()
  private snapshot: LiveSubscription[]
  // Just the registered page declarations, without the base -- what LiveRefresh's page channel
  // is built from, kept separate so the base's own channel never has to be recomputed for it.
  private pageSnapshot: LiveSubscription[] = []

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
    const registered = [...this.registered.values()].flat()
    this.pageSnapshot = dedupeSorted(registered)
    this.snapshot = dedupeSorted([this.base, ...registered])
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): LiveSubscription[] => this.snapshot
  getPageSnapshot = (): LiveSubscription[] => this.pageSnapshot
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

// Just the registered page declarations, without the base profile subscription -- what
// LiveRefresh's page channel is built from. The base gets its own permanent channel instead (see
// useLiveBaseSubscription), so a navigation that swaps a page's declarations never tears that
// one down.
export function usePageSubscriptions(): LiveSubscription[] {
  const registry = useContext(LiveTablesContext)
  return useSyncExternalStore(
    registry ? registry.subscribe : subscribeToNothing,
    registry ? registry.getPageSnapshot : getNoSubscriptions,
    registry ? registry.getPageSnapshot : getNoSubscriptions,
  )
}

// The base subscription is fixed for the registry's whole lifetime (set once from the signed-in
// user's id), so unlike the page declarations it needs no external-store subscription of its
// own -- reading it straight through context is enough.
export function useLiveBaseSubscription(): LiveSubscription | null {
  const registry = useContext(LiveTablesContext)
  return registry ? registry.base : null
}

export function LiveTables({ subscriptions }: { subscriptions: LiveSubscription[] }): null {
  const registry = useContext(LiveTablesContext)
  const key = subscriptionKey(subscriptions)
  const id = useId()

  useEffect(() => {
    if (!registry) return
    registry.register(id, subscriptions)
    return () => registry.unregister(id)
    // The key, not the subscriptions array, is the real dependency: a server component hands this
    // component a new array every render even when its tables and filters haven't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, id, key])

  return null
}
