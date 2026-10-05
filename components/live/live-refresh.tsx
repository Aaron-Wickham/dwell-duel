'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { subscriptionKey, useLiveBaseSubscription, useLiveMemberId, usePageSubscriptions, useStaleRenderSubscription } from './live-tables'

// Every table a page may follow row by row, always through a filter naming one market, member,
// parlay or row. supabase/migrations/0032 and 0035 publish them to the realtime publication (0053
// adds market_comments, 0108 market_categories); Postgres Changes then only delivers rows the
// member's RLS lets them read -- except DELETE events, which skip RLS and carry only the primary
// key. LiveRefresh never reads payloads either way; it just triggers a refresh, which re-reads
// through RLS.
export const LIVE_TABLES = [
  'bets',
  'markets',
  'market_resolutions',
  'parlays',
  'parlay_legs',
  'task_completions',
  'profiles',
  'activity_events',
  'market_comments',
  'market_categories',
] as const

export type LiveTable = (typeof LIVE_TABLES)[number]

// Group-wide changes, which every open page of a kind hears, arrive as Broadcast pings from the
// database (0092) instead: one per topic per transaction, and at most one per topic every
// LIVE_PING_INTERVAL_MS, however many rows moved. Mirrored by public.live_pings' rows.
export const LIVE_TOPICS = ['markets', 'pools', 'activity', 'reactions', 'tasks', 'reviews'] as const

export type LiveTopic = (typeof LIVE_TOPICS)[number]

// A page follows narrow rows through Postgres Changes, always filtered (the single `column=eq.value`
// form), and anything group-wide through a topic: an unfiltered table would send every open page a
// message for every row anyone writes (#250).
export type LiveTableSubscription = { table: LiveTable; filter: string }
export type LiveSubscription = LiveTableSubscription | { topic: LiveTopic }

export const DEBOUNCE_MS = 400
// However busy the stream, a refresh fires no later than this long after the first unflushed change.
export const MAX_WAIT_MS = 2000
// Mirrors public.live_ping_interval_ms(); a DB test keeps them equal.
export const LIVE_PING_INTERVAL_MS = 5000
// How long after a topic's latest ping its refresh may come. The database only holds a change back
// when it commits within LIVE_PING_INTERVAL_MS of the ping before it, so a refresh at least that
// long (plus a second's margin) after the latest ping reads everything the throttle kept quiet.
const MIN_TOPIC_DELAY_MS = LIVE_PING_INTERVAL_MS + 1000
export const TOPIC_REFRESH_DELAY_MS: Record<LiveTopic, number> = {
  markets: MIN_TOPIC_DELAY_MS,
  // Every bet moves a pool and writes a feed row, and /markets and the feed are the pages most
  // often open, so a longer wait folds more bets into each refresh (#251).
  pools: 15_000,
  activity: 15_000,
  reactions: MIN_TOPIC_DELAY_MS,
  tasks: MIN_TOPIC_DELAY_MS,
  reviews: MIN_TOPIC_DELAY_MS,
}
// A tab hidden this long gives up its channels, and with them its Realtime connection; coming back
// reopens them and refreshes. A quick app switch keeps them.
export const HIDDEN_CLOSE_MS = 60_000
// While a channel can't join (the project's connection cap, say), the page polls instead.
export const POLL_MS = 60_000

type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'

type Scheduler = {
  refresh: () => void
  topicPing: (topic: LiveTopic) => void
  status: (key: string, status: ChannelStatus) => void
  gone: (key: string) => void
}

const IDLE_SCHEDULER: Scheduler = { refresh() {}, topicPing() {}, status() {}, gone() {} }

// Every channel is private, so the project can refuse public channels: anyone holding the
// publishable key could otherwise open as many as they liked. Joining a private channel needs a
// realtime.messages policy for its topic (0092 for live:*, 0100 for live-member:*). A fresh object
// per channel, since RealtimeChannel writes its defaults into the options it's given.
const privateChannel = () => ({ config: { private: true } })

// A Postgres Changes channel's topic is live-member:<the member's id>:base or :page, then :<n>,
// and only that member may join it (0100). A fresh <n> per channel: RealtimeClient.channel(topic)
// hands back the still-closing channel of a reused topic, so rebuilding the page channel on the
// same topic after a page's declarations change would reuse a channel that's mid-teardown instead
// of opening a new one. One counter shared by both channels keeps every topic this component ever
// opens unique.
let generation = 0
export function memberTopic(memberId: string, channel: 'base' | 'page', n: number): string {
  return `live-member:${memberId}:${channel}:${n}`
}

// A Broadcast channel's topic is fixed (its RLS policy names it), so a topic being reopened waits
// for its previous channel's removal to finish instead.
const closingTopics = new Map<string, Promise<unknown>>()

type Client = Awaited<ReturnType<typeof loadSupabaseClient>>

// Loaded on mount rather than imported, so the Supabase client stays off every page's critical
// path.
async function loadSupabaseClient() {
  const { browserClient } = await import('@/lib/supabase/client')
  return browserClient()
}

function subscribeChannel(channel: RealtimeChannel, key: string, scheduler: () => Scheduler) {
  // The server can accept a join and then refuse its Postgres Changes ("Unable to subscribe to
  // changes…", an invalid filter column for a join that went out without the member's token, #310)
  // in a later system message, which never reaches the subscribe callback, so it's heard here.
  channel.on('system', {}, (payload: { status?: string }) => {
    if (payload?.status === 'error') scheduler().status(key, 'CHANNEL_ERROR')
  })
  // Postgres Changes has no replay, and a ping missed while the socket was down is gone too: the
  // first SUBSCRIBED is the initial join, and every later one follows a reconnect, so it refreshes.
  let joined = false
  channel.subscribe((status) => {
    scheduler().status(key, status as ChannelStatus)
    if (status !== 'SUBSCRIBED') return
    if (joined) scheduler().refresh()
    joined = true
  })
}

export function LiveRefresh(): null {
  const router = useRouter()
  const base = useLiveBaseSubscription()
  const memberId = useLiveMemberId()
  const onStaleRender = useStaleRenderSubscription()
  const declared = usePageSubscriptions()
  const tables = declared.filter((s): s is LiveTableSubscription => 'table' in s)
  const topics = declared.flatMap((s) => ('topic' in s ? [s.topic] : []))
  const tablesKey = subscriptionKey(tables)
  const topicsKey = topics.join(',')

  // False once the tab has been hidden for HIDDEN_CLOSE_MS: every channel closes, and reopens when
  // it's visible again.
  const [awake, setAwake] = useState(true)

  // Every channel schedules through the same scheduler, reached via a ref so the channel effects
  // (which rebuild) can call what the mount effect (which never does) owns, without depending on it.
  const schedulerRef = useRef<Scheduler>(IDLE_SCHEDULER)
  const scheduler = () => schedulerRef.current

  // The channel effects can fire in the same commit, so they share one dynamic import instead of
  // each starting their own.
  const clientRef = useRef<Promise<Client> | null>(null)
  // A fresh client is still reading the session from its cookies, and a join sent before that goes
  // out without the member's token, as anon: every filtered Postgres Changes subscription and every
  // private topic is then refused (#310). So the token is set before any channel opens, and again
  // when a sleeping tab wakes, since it may have expired meanwhile (setAuth reads it through
  // getSession, which refreshes an expired one).
  const authRef = useRef<Promise<void> | null>(null)
  function loadClient() {
    // A rejection clears the cached promise: offline or a stale chunk is often transient, and the
    // next navigation should try again rather than replay one bad load for the rest of the mount.
    clientRef.current ??= loadSupabaseClient().catch((error: unknown) => {
      clientRef.current = null
      throw error
    })
    return clientRef.current.then((supabase) => {
      authRef.current ??= supabase.realtime.setAuth().catch(() => {})
      return authRef.current.then(() => supabase)
    })
  }

  // The scheduler, the visibility listener and the polling fallback: set up once for the mount.
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    let maxWaitTimer: ReturnType<typeof setTimeout> | undefined
    const topicTimers = new Map<LiveTopic, { timer: ReturnType<typeof setTimeout>; followUpAt: number }>()
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined
    let pollTimer: ReturnType<typeof setInterval> | undefined
    let reportedPause = false
    const failing = new Set<string>()

    function flush() {
      clearTimeout(debounceTimer)
      clearTimeout(maxWaitTimer)
      debounceTimer = undefined
      maxWaitTimer = undefined
      // A hidden tab already gets caught up by the visibility handler below when it returns.
      if (document.visibilityState === 'hidden') return
      router.refresh()
    }

    // One action touches several tables (a bet writes bets and profiles), so bursts coalesce into a
    // single refresh -- but under a steady stream the trailing debounce alone would never fire, so a
    // refresh is also forced at MAX_WAIT_MS after the first change in the burst.
    function refresh() {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(flush, DEBOUNCE_MS)
      if (maxWaitTimer === undefined) maxWaitTimer = setTimeout(flush, MAX_WAIT_MS)
    }

    // A ping while its topic's refresh is waiting folds into it, and books one follow-up for the
    // latest ping's own delay: under a steady stream a topic refreshes once per delay, and there is
    // always a refresh at least one delay after the latest ping.
    function scheduleTopic(topic: LiveTopic, at: number) {
      const entry = {
        followUpAt: 0,
        timer: setTimeout(() => {
          topicTimers.delete(topic)
          refresh()
          if (entry.followUpAt > 0) scheduleTopic(topic, entry.followUpAt)
        }, at - Date.now()),
      }
      topicTimers.set(topic, entry)
    }

    function topicPing(topic: LiveTopic) {
      const at = Date.now() + TOPIC_REFRESH_DELAY_MS[topic]
      const pending = topicTimers.get(topic)
      if (pending) pending.followUpAt = at
      else scheduleTopic(topic, at)
    }

    function updatePolling() {
      if (failing.size > 0 && pollTimer === undefined) {
        if (!reportedPause) {
          reportedPause = true
          console.warn(`Live updates paused (a channel couldn't join); refreshing every ${POLL_MS / 1000}s instead`)
        }
        pollTimer = setInterval(() => {
          if (document.visibilityState === 'visible') router.refresh()
        }, POLL_MS)
      } else if (failing.size === 0 && pollTimer !== undefined) {
        clearInterval(pollTimer)
        pollTimer = undefined
      }
    }

    // supabase-js keeps retrying a failed join on its own; until one succeeds, the page polls.
    function status(key: string, next: ChannelStatus) {
      if (next === 'CHANNEL_ERROR' || next === 'TIMED_OUT') failing.add(key)
      else if (next === 'SUBSCRIBED') failing.delete(key)
      updatePolling()
    }

    function gone(key: string) {
      failing.delete(key)
      updatePolling()
    }

    schedulerRef.current = { refresh, topicPing, status, gone }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        clearTimeout(hiddenTimer)
        hiddenTimer = undefined
        setAwake(true)
        // A phone that backgrounds the app suspends the socket, and a tab that slept closed its
        // channels, so returning catches up straight away.
        refresh()
      } else if (hiddenTimer === undefined) {
        hiddenTimer = setTimeout(() => {
          authRef.current = null
          setAwake(false)
        }, HIDDEN_CLOSE_MS)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    if (document.visibilityState === 'hidden') onVisibilityChange()

    return () => {
      schedulerRef.current = IDLE_SCHEDULER
      clearTimeout(debounceTimer)
      clearTimeout(maxWaitTimer)
      for (const { timer } of topicTimers.values()) clearTimeout(timer)
      clearTimeout(hiddenTimer)
      clearInterval(pollTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [router])

  // A page shown from the client cache (#384) is refreshed in place, through the debounce, so it
  // folds into any refresh a live change has already booked.
  useEffect(() => onStaleRender(() => scheduler().refresh()), [onStaleRender])

  // The base `profiles` channel. The member's own balance must stay live through a navigation that
  // rebuilds the page's channels, so this never depends on the page's declarations.
  useEffect(() => {
    if (!base || !memberId || !awake) return
    let cancelled = false
    let teardown: (() => void) | undefined

    loadClient()
      .then((supabase) => {
        if (cancelled) return
        const key = memberTopic(memberId, 'base', ++generation)
        const channel = supabase.channel(key, privateChannel())
        channel.on('postgres_changes', { event: '*', schema: 'public', table: base.table, filter: base.filter }, () =>
          scheduler().refresh(),
        )
        subscribeChannel(channel, key, scheduler)
        teardown = () => {
          scheduler().gone(key)
          void supabase.removeChannel(channel)
        }
      })
      .catch(() => {
        // Offline or a stale deploy chunk: live updates quietly stop, and the foreground refresh still covers it.
      })

    return () => {
      cancelled = true
      teardown?.()
    }
  }, [base, memberId, awake])

  // The page's Postgres Changes channel, rebuilt whenever its declarations change.
  useEffect(() => {
    if (tables.length === 0 || !memberId || !awake) return
    let cancelled = false
    let teardown: (() => void) | undefined

    loadClient()
      .then((supabase) => {
        if (cancelled) return
        const key = memberTopic(memberId, 'page', ++generation)
        const channel = supabase.channel(key, privateChannel())
        for (const { table, filter } of tables) {
          channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => scheduler().refresh())
        }
        subscribeChannel(channel, key, scheduler)
        teardown = () => {
          scheduler().gone(key)
          void supabase.removeChannel(channel)
        }
      })
      .catch(() => {
        // Offline or a stale deploy chunk: live updates quietly stop, and the foreground refresh still covers it.
      })

    return () => {
      cancelled = true
      teardown?.()
    }
    // The key, not `tables` itself, decides when to rebuild: the registry hands back a fresh array
    // on every registration change even when its tables and filters repeat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey, memberId, awake])

  // One private Broadcast channel per topic the page declares.
  useEffect(() => {
    if (topicsKey === '' || !awake) return
    let cancelled = false
    const teardowns: (() => void)[] = []

    loadClient()
      .then(async (supabase) => {
        for (const topic of topicsKey.split(',') as LiveTopic[]) {
          const name = `live:${topic}`
          await closingTopics.get(name)
          if (cancelled) return
          const channel = supabase.channel(name, privateChannel())
          channel.on('broadcast', { event: 'changed' }, () => scheduler().topicPing(topic))
          subscribeChannel(channel, name, scheduler)
          teardowns.push(() => {
            scheduler().gone(name)
            const closing = supabase.removeChannel(channel).finally(() => {
              if (closingTopics.get(name) === closing) closingTopics.delete(name)
            })
            closingTopics.set(name, closing)
          })
        }
      })
      .catch(() => {
        // Offline or a stale deploy chunk: live updates quietly stop, and the foreground refresh still covers it.
      })

    return () => {
      cancelled = true
      for (const teardown of teardowns) teardown()
    }
  }, [topicsKey, awake])

  return null
}
