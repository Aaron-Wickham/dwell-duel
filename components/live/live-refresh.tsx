'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { subscriptionKey, useLiveBaseSubscription, usePageSubscriptions } from './live-tables'

// Every table a signed-in page reads its live numbers from. supabase/migrations/0032 and 0035
// publish them to the realtime publication (0037 adds cancelled_bets); Postgres Changes then only delivers rows the member's
// RLS lets them read -- except DELETE events, which skip RLS and carry only the primary key.
// LiveRefresh never reads payloads either way; it just triggers a refresh, which re-reads through RLS.
export const LIVE_TABLES = [
  'bets',
  'cancelled_bets',
  'markets',
  'market_resolutions',
  'parlays',
  'parlay_legs',
  'tasks',
  'task_completions',
  'profiles',
  'activity_events',
] as const

export type LiveTable = (typeof LIVE_TABLES)[number]

// `filter` is Postgres Changes' single `column=eq.value` form -- the only shape the pages in this
// app need.
export type LiveSubscription = { table: LiveTable; filter?: string }

export const DEBOUNCE_MS = 400
// However busy the stream, a refresh fires no later than this long after the first unflushed change.
export const MAX_WAIT_MS = 2000

// A fresh topic per channel: RealtimeClient.channel(topic) hands back the still-closing channel of
// a reused topic, so rebuilding the page channel on the same topic after a page's declarations
// change would reuse a channel that's mid-teardown instead of opening a new one. One counter
// shared by both channels keeps every topic this component ever opens unique.
let generation = 0

// Loaded on mount rather than imported, so the Supabase client stays off every page's critical
// path.
function loadSupabaseClient() {
  return import('@/lib/supabase/client')
}

export function LiveRefresh(): null {
  const router = useRouter()
  const base = useLiveBaseSubscription()
  const pageSubscriptions = usePageSubscriptions()
  const pageKey = subscriptionKey(pageSubscriptions)

  // Both channels schedule through the same debounce/maxWait pair, reached via a ref so the page
  // effect (which rebuilds on every navigation) can call the scheduler the base effect (which
  // never rebuilds) owns, without adding it as a dependency of either effect.
  const scheduleRefreshRef = useRef<() => void>(() => {})

  // Both channel effects can fire in the same commit (base on mount, page as soon as a
  // <LiveTables> registers), so they share one dynamic import instead of each starting their own:
  // besides the wasted duplicate fetch, two independent first-time `import()` calls for the same
  // specifier in the same tick is exactly the shape a bundler's module cache is least prepared for.
  const clientImportRef = useRef<ReturnType<typeof loadSupabaseClient> | null>(null)
  function loadClient() {
    // A rejection clears the cached promise instead of sticking around for the rest of the
    // mount: offline or a stale chunk is often transient, and PR B retried on every navigation,
    // so a memoized-forever rejection would regress that -- one bad load would otherwise mean no
    // live channel ever gets built again this session. Each caller keeps its own `.catch` too, so
    // this rethrow still ends up handled quietly.
    clientImportRef.current ??= loadSupabaseClient().catch((error: unknown) => {
      clientImportRef.current = null
      throw error
    })
    return clientImportRef.current
  }

  // The scheduler, the visibility listener, and the base `profiles` channel: set up once for the
  // whole mount. The member's own balance must stay live through a navigation that tears the page
  // channel down and rebuilds it, so this effect deliberately never depends on the page's
  // declarations -- only on `base`, which is fixed for the registry's lifetime.
  useEffect(() => {
    let cancelled = false
    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    let maxWaitTimer: ReturnType<typeof setTimeout> | undefined
    let teardown: (() => void) | undefined

    function flush() {
      clearTimeout(debounceTimer)
      clearTimeout(maxWaitTimer)
      debounceTimer = undefined
      maxWaitTimer = undefined
      // A hidden tab already gets caught up by the visibility handler below when it returns,
      // so there's no need to re-render it on every change anyone makes while it's away.
      if (document.visibilityState === 'hidden') return
      router.refresh()
    }

    // One action touches several tables (a bet writes bets and profiles), so bursts coalesce
    // into a single refresh -- but under a steady stream the trailing debounce alone would never
    // fire, so a refresh is also forced at MAX_WAIT_MS after the first change in the burst.
    function scheduleRefresh() {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(flush, DEBOUNCE_MS)
      if (maxWaitTimer === undefined) {
        maxWaitTimer = setTimeout(flush, MAX_WAIT_MS)
      }
    }
    scheduleRefreshRef.current = scheduleRefresh

    // A phone that backgrounds the app suspends the socket, and the client only notices a dead one
    // at its next heartbeat, so returning to the app catches up straight away.
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') scheduleRefresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    if (base) {
      loadClient()
        .then(({ browserClient }) => {
          if (cancelled) return
          const supabase = browserClient()
          const channel = supabase.channel(`live-base:${++generation}`)
          channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table: base.table, filter: base.filter },
            () => scheduleRefreshRef.current(),
          )

          // Postgres Changes has no replay: whatever changed while the socket was down is gone
          // once it rejoins. The first SUBSCRIBED is the initial join, and every later one
          // follows a reconnect.
          let joined = false
          channel.subscribe((status) => {
            if (status !== 'SUBSCRIBED') return
            if (joined) scheduleRefreshRef.current()
            joined = true
          })

          teardown = () => {
            supabase.removeChannel(channel)
          }
        })
        .catch(() => {
          // Offline or a stale deploy chunk: live updates quietly stop, and the foreground refresh still covers it.
        })
    }

    return () => {
      cancelled = true
      clearTimeout(debounceTimer)
      clearTimeout(maxWaitTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      teardown?.()
    }
  }, [router, base])

  // The page channel: built from the registered declarations only, and rebuilt whenever they
  // change. Absent entirely when no page has registered anything.
  useEffect(() => {
    if (pageSubscriptions.length === 0) return

    let cancelled = false
    let teardown: (() => void) | undefined

    loadClient()
      .then(({ browserClient }) => {
        if (cancelled) return
        const supabase = browserClient()
        const channel = supabase.channel(`live-refresh:${++generation}`)
        for (const { table, filter } of pageSubscriptions) {
          channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => scheduleRefreshRef.current())
        }

        // A channel rebuilt for new declarations is a fresh join too, since it's a new channel
        // object with its own `joined` flag -- its first SUBSCRIBED is never treated as a
        // reconnect.
        let joined = false
        channel.subscribe((status) => {
          if (status !== 'SUBSCRIBED') return
          if (joined) scheduleRefreshRef.current()
          joined = true
        })

        teardown = () => {
          supabase.removeChannel(channel)
        }
      })
      .catch(() => {
        // Offline or a stale deploy chunk: live updates quietly stop, and the foreground refresh still covers it.
      })

    return () => {
      cancelled = true
      teardown?.()
    }
    // The key, not `pageSubscriptions` itself, decides when to rebuild: the registry hands back a
    // fresh array on every registration change even when its tables and filters repeat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey])

  return null
}
