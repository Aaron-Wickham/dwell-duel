// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode, type ReactElement } from 'react'
import { act, render } from '@testing-library/react'
import { LiveTables, LiveTablesProvider } from '@/components/live/live-tables'
import type { LiveSubscription } from '@/components/live/live-refresh'

type Status = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT'
type Handler = () => void
type OnConfig = { event: string; schema: string; table: string; filter?: string }

interface MockChannel {
  topic: string
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  handlersByTable: Map<string, Handler[]>
  configsByTable: Map<string, OnConfig[]>
  report: (status: Status) => void
}

const mocks = vi.hoisted(() => {
  const channels: MockChannel[] = []

  function makeChannel(topic: string): MockChannel {
    const handlersByTable = new Map<string, Handler[]>()
    const configsByTable = new Map<string, OnConfig[]>()
    const channel: MockChannel = {
      topic,
      handlersByTable,
      configsByTable,
      report: () => {},
      on: vi.fn(),
      subscribe: vi.fn(),
    }
    channel.on = vi.fn((_type: string, config: OnConfig, handler: Handler) => {
      handlersByTable.set(config.table, [...(handlersByTable.get(config.table) ?? []), handler])
      configsByTable.set(config.table, [...(configsByTable.get(config.table) ?? []), config])
      return channel
    })
    channel.subscribe = vi.fn((callback: (status: Status) => void) => {
      channel.report = callback
      return channel
    })
    return channel
  }

  const client = {
    channel: vi.fn((topic: string) => {
      const channel = makeChannel(topic)
      channels.push(channel)
      return channel
    }),
    removeChannel: vi.fn(),
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

import { LIVE_TABLES, LiveRefresh } from '@/components/live/live-refresh'

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
function channels() {
  return { base: currentBaseChannel(), page: currentPageChannel() }
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

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
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
    expect(base.on).toHaveBeenCalledTimes(1)
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
    const { base, page } = await mount([{ table: 'profiles' }])

    expect(page!.configsByTable.get('profiles')).toEqual([
      { event: '*', schema: 'public', table: 'profiles', filter: undefined },
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
    const { base, page } = await mount([{ table: 'bets' }])

    fireChange(base, 'profiles')
    vi.advanceTimersByTime(200)
    fireChange(page!, 'bets')
    vi.advanceTimersByTime(399)
    expect(mocks.refresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes at least every 2s under a continuous stream of changes', async () => {
    const { base } = await mount()

    // Each change lands well inside the 400ms trailing window, so without a cap the debounce
    // would never fire.
    for (let i = 0; i < 6; i++) {
      fireChange(base, 'profiles')
      vi.advanceTimersByTime(300)
    }
    expect(mocks.refresh).not.toHaveBeenCalled()

    fireChange(base, 'profiles')
    vi.advanceTimersByTime(200)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)

    // The cap resets after it fires: a further burst waits out its own debounce again.
    fireChange(base, 'profiles')
    vi.advanceTimersByTime(399)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
  })

  it('skips the refresh for a change while the tab is hidden, then catches up once on return', async () => {
    const { base } = await mount()

    setVisibility('hidden')
    fireChange(base, 'profiles')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)
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
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes after a reconnect on the base channel, but not on its first join', async () => {
    const { base } = await mount()

    base.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).not.toHaveBeenCalled()

    base.report('CLOSED')
    base.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes after a reconnect on the page channel too, but not on its first join', async () => {
    const { page } = await mount([{ table: 'bets' }])

    page!.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).not.toHaveBeenCalled()

    page!.report('CLOSED')
    page!.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('treats the first SUBSCRIBED of a rebuilt page channel as a join, not a reconnect', async () => {
    const view = await mount()

    const { page: rebuiltPage } = await rebuild(view, [{ table: 'bets', filter: 'market_id=eq.market-1' }])

    rebuiltPage!.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('catches up when the app comes back to the foreground, not when it leaves', async () => {
    await mount()

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('folds a reconnect and a return to the foreground into one refresh', async () => {
    const { base } = await mount()
    base.report('SUBSCRIBED')

    document.dispatchEvent(new Event('visibilitychange'))
    base.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)

    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('removes both channels, the listener and any pending refresh on unmount', async () => {
    const { unmount, base, page } = await mount([{ table: 'bets' }])
    fireChange(base, 'profiles')

    unmount()
    vi.advanceTimersByTime(400)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)

    expect(mocks.client.removeChannel).toHaveBeenCalledWith(base)
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(page)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('opens no channel when it unmounts before the client has loaded', async () => {
    const { unmount } = render(<Harness />)
    unmount()
    await act(() => vi.dynamicImportSettled())

    expect(mocks.browserClient).not.toHaveBeenCalled()
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

    render(<StrictHarness subscriptions={[{ table: 'bets' }]} />)
    await act(() => vi.dynamicImportSettled())
    await act(() => vi.dynamicImportSettled())

    const baseChannels = mocks.channels.filter((c) => c.topic.startsWith('live-base:'))
    const pageChannels = mocks.channels.filter((c) => c.topic.startsWith('live-refresh:'))
    expect(baseChannels).toHaveLength(1)
    expect(pageChannels).toHaveLength(1)
  })

})
