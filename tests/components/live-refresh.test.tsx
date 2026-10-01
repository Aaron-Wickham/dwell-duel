// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode, type ReactElement } from 'react'
import { act, render } from '@testing-library/react'
import { LiveTables, LiveTablesProvider } from '@/components/live/live-tables'
import type { LiveSubscription } from '@/components/live/live-refresh'

type Status = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT'
type Handler = (payload?: unknown) => void
type OnConfig = { event: string; schema?: string; table?: string; filter?: string }

interface MockChannel {
  topic: string
  // Whether the Realtime token had been set when subscribe() was called.
  authedAtSubscribe?: boolean
  options?: { config: { private?: boolean } }
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  handlersByTable: Map<string, Handler[]>
  configsByTable: Map<string, OnConfig[]>
  report: (status: Status) => void
}

const mocks = vi.hoisted(() => {
  const channels: MockChannel[] = []
  const state = { authed: false }

  function makeChannel(topic: string, options?: MockChannel['options']): MockChannel {
    const handlersByTable = new Map<string, Handler[]>()
    const configsByTable = new Map<string, OnConfig[]>()
    const channel: MockChannel = {
      topic,
      options,
      handlersByTable,
      configsByTable,
      report: () => {},
      on: vi.fn(),
      subscribe: vi.fn(),
    }
    // Postgres Changes handlers are keyed by table, Broadcast ones by `broadcast:<event>`, and the
    // system-message handler by `system`.
    channel.on = vi.fn((type: string, config: OnConfig, handler: Handler) => {
      const key = type === 'broadcast' ? `broadcast:${config.event}` : type === 'system' ? 'system' : config.table!
      handlersByTable.set(key, [...(handlersByTable.get(key) ?? []), handler])
      configsByTable.set(key, [...(configsByTable.get(key) ?? []), config])
      return channel
    })
    channel.subscribe = vi.fn((callback: (status: Status) => void) => {
      channel.authedAtSubscribe = state.authed
      channel.report = callback
      return channel
    })
    return channel
  }

  const client = {
    channel: vi.fn((topic: string, options?: MockChannel['options']) => {
      const channel = makeChannel(topic, options)
      channels.push(channel)
      return channel
    }),
    removeChannel: vi.fn((_channel: MockChannel): Promise<string> => Promise.resolve('ok')),
    realtime: {
      setAuth: vi.fn((): Promise<void> => {
        state.authed = true
        return Promise.resolve()
      }),
    },
  }
  const refresh = vi.fn()
  // Next's real useRouter() returns a stable object across renders; a fresh one on every call
  // (the natural way to stub it) would make the base effect's [router, base] deps look changed on
  // every render regardless of base, which the app never sees in practice.
  const router = { refresh }

  // A one-shot switch to simulate a transient failure of the shared dynamic import (offline, a
  // stale deploy chunk): set before a render, it fails the very next `import('@/lib/supabase/client')`
  // and then clears itself, so the following attempt succeeds normally.
  let failNextImport = false
  return {
    channels,
    state,
    client,
    browserClient: vi.fn(() => client),
    refresh,
    router,
    failNextImport: () => {
      failNextImport = true
    },
    consumeImportFailure: () => {
      const shouldFail = failNextImport
      failNextImport = false
      return shouldFail
    },
  }
})

vi.mock('@/lib/supabase/client', () => {
  if (mocks.consumeImportFailure()) throw new Error('stale deploy chunk')
  return { browserClient: mocks.browserClient }
})
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))

import {
  DEBOUNCE_MS,
  HIDDEN_CLOSE_MS,
  LIVE_PING_INTERVAL_MS,
  LIVE_TABLES,
  LiveRefresh,
  MAX_WAIT_MS,
  POLL_MS,
  TOPIC_REFRESH_DELAY_MS,
} from '@/components/live/live-refresh'

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

function fireChange(channel: MockChannel, table: string, index = 0) {
  channel.handlersByTable.get(table)![index]()
}

// The base channel's topic is `live-base:<n>`, the page channel's `live-refresh:<n>` -- distinct
// prefixes, so both are easy to tell apart in the shared mock channel list regardless of order.
function currentBaseChannel(): MockChannel {
  return [...mocks.channels].reverse().find((c) => c.topic.startsWith('live-base:'))!
}
function currentPageChannel(): MockChannel | undefined {
  return [...mocks.channels].reverse().find((c) => c.topic.startsWith('live-refresh:'))
}
function currentTopicChannel(topic: string): MockChannel | undefined {
  return [...mocks.channels].reverse().find((c) => c.topic === `live:${topic}`)
}
function channels() {
  return { base: currentBaseChannel(), page: currentPageChannel() }
}

// Settles the promise chains a channel effect runs through once the client is already loaded.
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
}

function hide() {
  setVisibility('hidden')
  document.dispatchEvent(new Event('visibilitychange'))
}

function show() {
  setVisibility('visible')
  document.dispatchEvent(new Event('visibilitychange'))
}

function Harness({ subscriptions }: { subscriptions?: LiveSubscription[] }) {
  return (
    <LiveTablesProvider userId="member-1">
      <LiveRefresh />
      {subscriptions && <LiveTables subscriptions={subscriptions} />}
    </LiveTablesProvider>
  )
}

// Always mounts base-only first and lets the dynamic import settle, exactly like a fresh page
// load before any <LiveTables> has registered. A page's declarations are then added as a genuinely
// separate update -- as they are on a client-side navigation -- so the fake clock only ever drives
// the debounce and maxWait logic under test, never a mount-time registration race.
async function mount(subscriptions?: LiveSubscription[]) {
  const view = render(<Harness />)
  await act(() => vi.dynamicImportSettled())

  if (subscriptions) {
    await act(async () => {
      view.rerender(<Harness subscriptions={subscriptions} />)
    })
    await act(() => vi.dynamicImportSettled())
  }

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  return { ...view, ...channels() }
}

// For a rebuild that happens mid-test, after fake timers are already active: the channel swap
// still goes through a real dynamic import, so it still needs a real settle.
async function rebuild(view: { rerender: (node: ReactElement) => void }, subscriptions?: LiveSubscription[]) {
  await act(async () => {
    view.rerender(<Harness subscriptions={subscriptions} />)
  })
  await act(() => vi.dynamicImportSettled())
  return channels()
}

beforeEach(() => {
  mocks.channels.length = 0
  mocks.client.channel.mockClear()
  mocks.client.removeChannel.mockClear()
  mocks.client.removeChannel.mockImplementation(() => Promise.resolve('ok'))
  mocks.client.realtime.setAuth.mockClear()
  mocks.state.authed = false
  mocks.browserClient.mockClear()
  mocks.refresh.mockClear()
  mocks.consumeImportFailure() // clears a leftover flag from a test that failed before using it
  setVisibility('visible')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('LiveRefresh', () => {
  // Declared first deliberately: a dynamically-imported module that resolves successfully stays
  // cached for the rest of this file, exactly like a real dynamic import, so only the very first
  // import attempt in the whole suite can still be made to fail. Every later test benefits from
  // that same cached, already-succeeded client the way production code would.
  it('retries the shared import after a transient failure, and builds the page channel once it succeeds', async () => {
    // The base effect is the first to call the shared loadClient(), so it's the one that eats
    // the one-shot failure: no channel exists yet afterwards.
    mocks.failNextImport()
    const view = render(<Harness />)
    await act(() => vi.dynamicImportSettled())

    expect(mocks.channels).toHaveLength(0)

    // A page registering next -- exactly like PR B retrying on the next navigation -- makes a
    // fresh attempt rather than replaying the same rejected promise, and this one succeeds.
    await act(async () => {
      view.rerender(<Harness subscriptions={[{ table: 'bets', filter: 'market_id=eq.market-1' }]} />)
    })
    await act(() => vi.dynamicImportSettled())

    const pageChannels = mocks.channels.filter((c) => c.topic.startsWith('live-refresh:'))
    expect(pageChannels).toHaveLength(1)
  })

  it('renders nothing and opens a channel bound to only the base profile subscription with no page registered', async () => {
    const { container, base, page } = await mount()

    expect(container).toBeEmptyDOMElement()
    expect(page).toBeUndefined()
    expect(mocks.client.channel).toHaveBeenCalledTimes(1)
    expect(base.on.mock.calls.filter(([type]) => type === 'postgres_changes')).toHaveLength(1)
    expect(base.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles', filter: 'id=eq.member-1' },
      expect.any(Function),
    )
    expect(base.subscribe).toHaveBeenCalledTimes(1)
  })

  it('opens a page channel for every LIVE_TABLES entry a page declares, filters passed through, separate from the base', async () => {
    const { base, page } = await mount([
      { table: 'bets', filter: 'market_id=eq.market-1' },
      { table: 'markets', filter: 'id=eq.market-1' },
    ])

    expect(page).toBeDefined()
    for (const table of LIVE_TABLES) {
      const shouldSubscribeOnPage = table === 'bets' || table === 'markets'
      expect(page!.handlersByTable.has(table)).toBe(shouldSubscribeOnPage)
    }
    expect(page!.configsByTable.get('bets')).toEqual([
      { event: '*', schema: 'public', table: 'bets', filter: 'market_id=eq.market-1' },
    ])
    expect(page!.configsByTable.get('markets')).toEqual([
      { event: '*', schema: 'public', table: 'markets', filter: 'id=eq.market-1' },
    ])
    expect(page!.handlersByTable.has('profiles')).toBe(false)
    expect(base.configsByTable.get('profiles')).toEqual([
      { event: '*', schema: 'public', table: 'profiles', filter: 'id=eq.member-1' },
    ])
  })

  it('carries only the page subscriptions on the page channel, even when a page also declares profiles', async () => {
    const { base, page } = await mount([{ table: 'profiles', filter: 'id=eq.member-2' }])

    expect(page!.configsByTable.get('profiles')).toEqual([
      { event: '*', schema: 'public', table: 'profiles', filter: 'id=eq.member-2' },
    ])
    expect(base.configsByTable.get('profiles')).toEqual([
      { event: '*', schema: 'public', table: 'profiles', filter: 'id=eq.member-1' },
    ])
  })

  it('opens a page channel on the first registration, without touching the base', async () => {
    const view = await mount()
    const firstBase = view.base
    expect(mocks.client.channel).toHaveBeenCalledTimes(1)
    expect(mocks.client.removeChannel).not.toHaveBeenCalled()

    const { base: secondBase, page } = await rebuild(view, [{ table: 'bets', filter: 'market_id=eq.market-1' }])

    expect(secondBase).toBe(firstBase)
    expect(mocks.client.channel).toHaveBeenCalledTimes(2)
    expect(mocks.client.removeChannel).not.toHaveBeenCalled()
    expect(page!.handlersByTable.has('bets')).toBe(true)
    expect(page!.handlersByTable.has('profiles')).toBe(false)
  })

  it('rebuilds only the page channel on a further key change, and never removes or rebuilds the base', async () => {
    const view = await mount([{ table: 'bets', filter: 'market_id=eq.market-1' }])
    const firstBase = view.base
    const firstPage = view.page!
    const channelCallsAfterFirstMount = mocks.client.channel.mock.calls.length

    const { base: secondBase, page: secondPage } = await rebuild(view, [{ table: 'markets', filter: 'id=eq.market-2' }])

    expect(secondBase).toBe(firstBase)
    expect(mocks.client.channel).toHaveBeenCalledTimes(channelCallsAfterFirstMount + 1)
    expect(secondPage!.topic).not.toBe(firstPage.topic)
    expect(secondPage!.handlersByTable.has('markets')).toBe(true)
    expect(secondPage!.handlersByTable.has('bets')).toBe(false)
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(firstPage)
    expect(mocks.client.removeChannel).not.toHaveBeenCalledWith(firstBase)
  })

  it('does not rebuild either channel when a re-render carries the same declarations under a new array', async () => {
    const subs: LiveSubscription[] = [{ table: 'bets', filter: 'market_id=eq.market-1' }]
    const view = await mount(subs)
    const channelCallsAfterMount = mocks.client.channel.mock.calls.length
    const removeCallsAfterMount = mocks.client.removeChannel.mock.calls.length

    // A fresh array with identical content, exactly like a server re-render's props.
    await rebuild(view, [{ table: 'bets', filter: 'market_id=eq.market-1' }])

    expect(mocks.client.channel).toHaveBeenCalledTimes(channelCallsAfterMount)
    expect(mocks.client.removeChannel).toHaveBeenCalledTimes(removeCallsAfterMount)
  })

  it('refreshes once, 400ms after the last change in a burst across the base and the page channel', async () => {
    const { base, page } = await mount([{ table: 'bets', filter: 'market_id=eq.market-1' }])

    fireChange(base, 'profiles')
    vi.advanceTimersByTime(200)
    fireChange(page!, 'bets')
    vi.advanceTimersByTime(DEBOUNCE_MS - 1)
    expect(mocks.refresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes at least every 2s under a continuous stream of changes', async () => {
    const { base } = await mount()

    // Each change lands well inside the 400ms trailing window, so without a cap the debounce
    // would never fire.
    const STEP = 300
    const STEPS = 6
    for (let i = 0; i < STEPS; i++) {
      fireChange(base, 'profiles')
      vi.advanceTimersByTime(STEP)
    }
    expect(mocks.refresh).not.toHaveBeenCalled()

    fireChange(base, 'profiles')
    vi.advanceTimersByTime(MAX_WAIT_MS - STEP * STEPS)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)

    // The cap resets after it fires: a further burst waits out its own debounce again.
    fireChange(base, 'profiles')
    vi.advanceTimersByTime(DEBOUNCE_MS - 1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
  })

  it('skips the refresh for a change while the tab is hidden, then catches up once on return', async () => {
    const { base } = await mount()

    setVisibility('hidden')
    fireChange(base, 'profiles')
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(mocks.refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('skips a maxWait tick while hidden too, and still catches up once on return', async () => {
    const { base } = await mount()

    setVisibility('hidden')
    for (let i = 0; i < 7; i++) {
      fireChange(base, 'profiles')
      vi.advanceTimersByTime(300)
    }
    expect(mocks.refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes after a reconnect on the base channel, but not on its first join', async () => {
    const { base } = await mount()

    base.report('SUBSCRIBED')
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(mocks.refresh).not.toHaveBeenCalled()

    base.report('CLOSED')
    base.report('SUBSCRIBED')
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes after a reconnect on the page channel too, but not on its first join', async () => {
    const { page } = await mount([{ table: 'bets', filter: 'market_id=eq.market-1' }])

    page!.report('SUBSCRIBED')
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(mocks.refresh).not.toHaveBeenCalled()

    page!.report('CLOSED')
    page!.report('SUBSCRIBED')
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('treats the first SUBSCRIBED of a rebuilt page channel as a join, not a reconnect', async () => {
    const view = await mount()

    const { page: rebuiltPage } = await rebuild(view, [{ table: 'bets', filter: 'market_id=eq.market-1' }])

    rebuiltPage!.report('SUBSCRIBED')
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('catches up when the app comes back to the foreground, not when it leaves', async () => {
    await mount()

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(mocks.refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('folds a reconnect and a return to the foreground into one refresh', async () => {
    const { base } = await mount()
    base.report('SUBSCRIBED')

    document.dispatchEvent(new Event('visibilitychange'))
    base.report('SUBSCRIBED')
    vi.advanceTimersByTime(DEBOUNCE_MS)

    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('removes both channels, the listener and any pending refresh on unmount', async () => {
    const { unmount, base, page } = await mount([{ table: 'bets', filter: 'market_id=eq.market-1' }])
    fireChange(base, 'profiles')

    unmount()
    vi.advanceTimersByTime(DEBOUNCE_MS)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(DEBOUNCE_MS)

    expect(mocks.client.removeChannel).toHaveBeenCalledWith(base)
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(page)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('opens no channel when it unmounts before the client has loaded', async () => {
    const { unmount } = render(<Harness />)
    unmount()
    await act(() => vi.dynamicImportSettled())

    expect(mocks.client.channel).not.toHaveBeenCalled()
  })

  it('builds exactly one base channel and one page channel when LiveRefresh and a page mount together', async () => {
    // The real first-load path: unlike mount()'s two-step render, a page's <LiveTables> is
    // already present in the very first commit, so its registration effect fires (and the page
    // key changes) before either dynamic import has resolved.
    render(<Harness subscriptions={[{ table: 'bets', filter: 'market_id=eq.market-1' }]} />)
    await act(() => vi.dynamicImportSettled())
    await act(() => vi.dynamicImportSettled())

    const baseChannels = mocks.channels.filter((c) => c.topic.startsWith('live-base:'))
    const pageChannels = mocks.channels.filter((c) => c.topic.startsWith('live-refresh:'))
    expect(baseChannels).toHaveLength(1)
    expect(pageChannels).toHaveLength(1)
    expect(mocks.client.removeChannel).not.toHaveBeenCalled()
  })

  it('is safe under StrictMode: exactly one base channel and one page channel survive the double-invoked effects', async () => {
    function StrictHarness({ subscriptions }: { subscriptions?: LiveSubscription[] }) {
      return (
        <StrictMode>
          <Harness subscriptions={subscriptions} />
        </StrictMode>
      )
    }

    render(<StrictHarness subscriptions={[{ table: 'bets', filter: 'market_id=eq.market-1' }]} />)
    await act(() => vi.dynamicImportSettled())
    await act(() => vi.dynamicImportSettled())

    const baseChannels = mocks.channels.filter((c) => c.topic.startsWith('live-base:'))
    const pageChannels = mocks.channels.filter((c) => c.topic.startsWith('live-refresh:'))
    expect(baseChannels).toHaveLength(1)
    expect(pageChannels).toHaveLength(1)
  })

  it('sets the auth token before opening any channel, since a private join carries it', async () => {
    await mount([{ topic: 'markets' }])

    const setAuthOrder = mocks.client.realtime.setAuth.mock.invocationCallOrder[0]
    const firstChannelOrder = mocks.client.channel.mock.invocationCallOrder[0]
    expect(setAuthOrder).toBeLessThan(firstChannelOrder)
  })

  it('opens one private Broadcast channel per declared topic, and no Postgres Changes page channel for topics alone', async () => {
    const { page } = await mount([{ topic: 'markets' }, { topic: 'pools' }])

    expect(page).toBeUndefined()
    for (const topic of ['markets', 'pools']) {
      const channel = currentTopicChannel(topic)!
      expect(channel.options).toEqual({ config: { private: true } })
      expect(channel.on).toHaveBeenCalledWith('broadcast', { event: 'changed' }, expect.any(Function))
      expect(channel.subscribe).toHaveBeenCalledTimes(1)
    }
  })

  it('refreshes a topic once its delay has passed after a ping, folding a later ping into it', async () => {
    await mount([{ topic: 'markets' }])
    const markets = currentTopicChannel('markets')!

    fireChange(markets, 'broadcast:changed')
    vi.advanceTimersByTime(TOPIC_REFRESH_DELAY_MS.markets + DEBOUNCE_MS - 1)
    expect(mocks.refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(TOPIC_REFRESH_DELAY_MS.markets * 3)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  // The database may hold back changes for an interval after any ping it sends, so the latest ping
  // needs a refresh of its own at least one delay later, even while an earlier one is waiting.
  it('books a follow-up refresh one delay after the latest ping in a burst', async () => {
    await mount([{ topic: 'markets' }])
    const markets = currentTopicChannel('markets')!
    const delay = TOPIC_REFRESH_DELAY_MS.markets

    fireChange(markets, 'broadcast:changed')
    vi.advanceTimersByTime(delay - 500)
    fireChange(markets, 'broadcast:changed')
    vi.advanceTimersByTime(500 + DEBOUNCE_MS)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(delay - 500 - 1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(delay * 3)
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
  })

  it('waits longer for the busy pools and activity topics than for markets', async () => {
    expect(TOPIC_REFRESH_DELAY_MS.pools).toBe(15_000)
    expect(TOPIC_REFRESH_DELAY_MS.activity).toBe(15_000)
    expect(TOPIC_REFRESH_DELAY_MS.markets).toBe(LIVE_PING_INTERVAL_MS + 1000)
    for (const delay of Object.values(TOPIC_REFRESH_DELAY_MS)) expect(delay).toBeGreaterThan(LIVE_PING_INTERVAL_MS)

    await mount([{ topic: 'pools' }])
    fireChange(currentTopicChannel('pools')!, 'broadcast:changed')
    vi.advanceTimersByTime(TOPIC_REFRESH_DELAY_MS.pools + DEBOUNCE_MS - 1)
    expect(mocks.refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('reopens a topic only after its previous channel has finished closing', async () => {
    const view = await mount([{ topic: 'markets' }])
    const first = currentTopicChannel('markets')!

    let finishClosing: (status: string) => void = () => {}
    mocks.client.removeChannel.mockImplementationOnce(() => new Promise((resolve) => (finishClosing = resolve)))
    await rebuild(view, [{ topic: 'markets' }, { topic: 'pools' }])

    expect(mocks.client.removeChannel).toHaveBeenCalledWith(first)
    expect(currentTopicChannel('markets')).toBe(first)

    finishClosing('ok')
    await settle()
    const reopened = currentTopicChannel('markets')!
    expect(reopened).not.toBe(first)
    expect(currentTopicChannel('pools')).toBeDefined()
  })

  it('keeps its channels through a short trip to the background', async () => {
    const { base, page } = await mount([{ table: 'bets', filter: 'market_id=eq.market-1' }, { topic: 'markets' }])

    hide()
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS - 1)
    show()
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS)
    await settle()

    expect(mocks.client.removeChannel).not.toHaveBeenCalled()
    expect(channels()).toEqual({ base, page })
  })

  it('closes every channel once the tab has been hidden a while, and reopens them with a refresh on return', async () => {
    const { base, page } = await mount([{ table: 'bets', filter: 'market_id=eq.market-1' }, { topic: 'markets' }])
    const topic = currentTopicChannel('markets')!

    hide()
    await act(async () => {
      vi.advanceTimersByTime(HIDDEN_CLOSE_MS)
    })
    await settle()

    expect(mocks.client.removeChannel).toHaveBeenCalledWith(base)
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(page)
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(topic)
    const opened = mocks.client.channel.mock.calls.length

    await act(async () => show())
    await settle()

    expect(mocks.client.channel.mock.calls.length).toBe(opened + 3)
    expect(currentBaseChannel()).not.toBe(base)
    expect(currentPageChannel()).not.toBe(page)
    expect(currentTopicChannel('markets')).not.toBe(topic)
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('closes its channels a while after mounting in a hidden tab', async () => {
    setVisibility('hidden')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    render(<Harness />)
    await act(() => vi.dynamicImportSettled())
    const base = currentBaseChannel()

    await act(async () => {
      vi.advanceTimersByTime(HIDDEN_CLOSE_MS)
    })
    await settle()

    expect(mocks.client.removeChannel).toHaveBeenCalledWith(base)
  })

  it('polls while a channel cannot join, and stops once it has', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { base, page } = await mount([{ table: 'bets', filter: 'market_id=eq.market-1' }])

    base.report('SUBSCRIBED')
    page!.report('CHANNEL_ERROR')
    vi.advanceTimersByTime(POLL_MS)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)

    // A hidden tab skips the poll.
    setVisibility('hidden')
    vi.advanceTimersByTime(POLL_MS)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    setVisibility('visible')

    page!.report('TIMED_OUT')
    vi.advanceTimersByTime(POLL_MS)
    expect(mocks.refresh).toHaveBeenCalledTimes(2)

    page!.report('SUBSCRIBED')
    vi.advanceTimersByTime(DEBOUNCE_MS)
    const afterRejoin = mocks.refresh.mock.calls.length
    vi.advanceTimersByTime(POLL_MS * 3)
    expect(mocks.refresh).toHaveBeenCalledTimes(afterRejoin)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('stops polling when the failing channel is removed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const view = await mount([{ topic: 'reviews' }])
    currentTopicChannel('reviews')!.report('CHANNEL_ERROR')

    await rebuild(view, undefined)
    vi.advanceTimersByTime(POLL_MS * 2)

    expect(mocks.refresh).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  // #310: a join sent before the client has read the session goes out as anon, and the server then
  // refuses every filtered Postgres Changes subscription and every private topic.
  function holdAuth(): () => Promise<void> {
    let release: () => void = () => {}
    mocks.client.realtime.setAuth.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            mocks.state.authed = true
            resolve()
          }
        }),
    )
    return async () => {
      release()
      await settle()
    }
  }

  it('sets the Realtime token before the base, page and topic channels subscribe', async () => {
    const releaseAuth = holdAuth()
    render(<Harness subscriptions={[{ table: 'bets', filter: 'market_id=eq.market-1' }, { topic: 'markets' }]} />)
    await act(() => vi.dynamicImportSettled())
    await settle()

    expect(mocks.client.realtime.setAuth).toHaveBeenCalledTimes(1)
    expect(mocks.channels.filter((c) => c.subscribe.mock.calls.length > 0)).toEqual([])

    await releaseAuth()

    const subscribed = mocks.channels.filter((c) => c.subscribe.mock.calls.length > 0)
    expect(subscribed.map((c) => c.topic.replace(/:\d+$/, ''))).toEqual(
      expect.arrayContaining(['live-base', 'live-refresh', 'live:markets']),
    )
    expect(subscribed.every((c) => c.authedAtSubscribe)).toBe(true)
  })

  it('sets the token again before reopening channels when a sleeping tab wakes', async () => {
    const { base, page } = await mount([{ table: 'bets', filter: 'market_id=eq.market-1' }, { topic: 'markets' }])
    expect(mocks.client.realtime.setAuth).toHaveBeenCalledTimes(1)

    hide()
    await act(async () => {
      vi.advanceTimersByTime(HIDDEN_CLOSE_MS)
    })
    await settle()
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(base)
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(page)

    mocks.state.authed = false
    const releaseAuth = holdAuth()
    const opened = mocks.channels.length
    await act(async () => show())
    await settle()

    expect(mocks.client.realtime.setAuth).toHaveBeenCalledTimes(2)
    expect(mocks.channels.slice(opened).filter((c) => c.subscribe.mock.calls.length > 0)).toEqual([])

    await releaseAuth()

    const reopened = mocks.channels.slice(opened)
    expect(reopened).toHaveLength(3)
    expect(reopened.every((c) => c.subscribe.mock.calls.length === 1 && c.authedAtSubscribe)).toBe(true)
  })

  it('polls when the server refuses a joined channel its Postgres Changes in a system message', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { base, page } = await mount([{ table: 'bets', filter: 'market_id=eq.market-1' }])
    base.report('SUBSCRIBED')
    page!.report('SUBSCRIBED')

    // An ok system message ("Subscribed to PostgreSQL") changes nothing.
    page!.handlersByTable.get('system')![0]({ status: 'ok', message: 'Subscribed to PostgreSQL' } as never)
    vi.advanceTimersByTime(POLL_MS)
    expect(mocks.refresh).not.toHaveBeenCalled()

    base.handlersByTable.get('system')![0]({
      status: 'error',
      message: 'Unable to subscribe to changes with given parameters. … invalid column for filter id',
    } as never)
    vi.advanceTimersByTime(POLL_MS)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(POLL_MS)
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('polls when a private topic join is refused', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await mount([{ topic: 'reviews' }])
    currentTopicChannel('reviews')!.report('CHANNEL_ERROR')
    vi.advanceTimersByTime(POLL_MS)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
