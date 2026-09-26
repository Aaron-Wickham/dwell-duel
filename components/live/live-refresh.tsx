'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Every table a signed-in page reads its live numbers from. supabase/migrations/0032 adds them to
// the realtime publication; Postgres Changes then only delivers rows the member's RLS lets them
// read -- except DELETE events, which skip RLS and carry only the primary key. LiveRefresh never
// reads payloads either way; it just triggers a refresh, which re-reads through RLS.
export const LIVE_TABLES = [
  'bets',
  'markets',
  'market_resolutions',
  'parlays',
  'parlay_legs',
  'tasks',
  'task_completions',
  'profiles',
] as const

const DEBOUNCE_MS = 400

export function LiveRefresh(): null {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let teardown: (() => void) | undefined

    // One action touches several tables (a bet writes bets and profiles), so bursts coalesce
    // into a single refresh.
    function scheduleRefresh() {
      clearTimeout(timer)
      timer = setTimeout(() => {
        // A hidden tab already gets caught up by the visibility handler below when it returns,
        // so there's no need to re-render it on every change anyone makes while it's away.
        if (document.visibilityState === 'hidden') return
        router.refresh()
      }, DEBOUNCE_MS)
    }

    // A phone that backgrounds the app suspends the socket, and the client only notices a dead one
    // at its next heartbeat, so returning to the app catches up straight away.
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') scheduleRefresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // Loaded on mount rather than imported, so the Supabase client stays off every page's
    // critical path.
    import('@/lib/supabase/client').then(({ browserClient }) => {
      if (cancelled) return
      const supabase = browserClient()
      const channel = supabase.channel('live-refresh')
      for (const table of LIVE_TABLES) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh)
      }

      // Postgres Changes has no replay: whatever changed while the socket was down is gone once it
      // rejoins. The first SUBSCRIBED is the initial join, and every later one follows a reconnect.
      let joined = false
      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        if (joined) scheduleRefresh()
        joined = true
      })

      teardown = () => {
        supabase.removeChannel(channel)
      }
    }).catch(() => {
      // Offline or a stale deploy chunk: live updates quietly stop, and the foreground refresh still covers it.
    })

    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      teardown?.()
    }
  }, [router])

  return null
}
