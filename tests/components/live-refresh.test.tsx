// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
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
  // (the natural way to stub it) would make the effect's [router, key] deps look changed on every
  // render regardless of key, which the app never sees in practice.
  const router = { refresh }
  return { channels, client, browserClient: vi.fn(() => client), refresh, router }
})

vi.mock('@/lib/supabase/client', () => ({ browserClient: mocks.browserClient }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))

import { LIVE_TABLES, LiveRefresh } from '@/components/live/live-refresh'

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

function fireChange(channel: MockChannel, table: string, index = 0) {
  channel.handlersByTable.get(table)![index]()
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
  return { ...view, channel: mocks.channels.at(-1)! }
}

// For a rebuild that happens mid-test, after fake timers are already active: the channel swap
// still goes through a real dynamic import, so it still needs a real settle.
async function rebuild(view: { rerender: (node: ReactElement) => void }, subscriptions?: LiveSubscription[]) {
  await act(async () => {
    view.rerender(<Harness subscriptions={subscriptions} />)
  })
  await act(() => vi.dynamicImportSettled())
  return mocks.channels.at(-1)!
}

beforeEach(() => {
  mocks.channels.length = 0
  mocks.client.channel.mockClear()
  mocks.client.removeChannel.mockClear()
  mocks.browserClient.mockClear()
  mocks.refresh.mockClear()
  setVisibility('visible')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('LiveRefresh', () => {
  it('renders nothing and opens a channel bound to only the base profile subscription with no page registered', async () => {
    const { container, channel } = await mount()

    expect(container).toBeEmptyDOMElement()
    expect(mocks.client.channel).toHaveBeenCalledTimes(1)
    expect(channel.on).toHaveBeenCalledTimes(1)
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles', filter: 'id=eq.member-1' },
      expect.any(Function),
    )
    expect(channel.subscribe).toHaveBeenCalledTimes(1)
  })

  it('opens a channel for every LIVE_TABLES entry a page declares, filters passed through, plus the base', async () => {
    const { channel } = await mount([
      { table: 'bets', filter: 'market_id=eq.market-1' },
      { table: 'markets', filter: 'id=eq.market-1' },
    ])

    for (const table of LIVE_TABLES) {
      const shouldSubscribe = table === 'profiles' || table === 'bets' || table === 'markets'
      expect(channel.handlersByTable.has(table)).toBe(shouldSubscribe)
    }
    expect(channel.configsByTable.get('bets')).toEqual([
      { event: '*', schema: 'public', table: 'bets', filter: 'market_id=eq.market-1' },
    ])
    expect(channel.configsByTable.get('markets')).toEqual([
      { event: '*', schema: 'public', table: 'markets', filter: 'id=eq.market-1' },
    ])
    expect(channel.configsByTable.get('profiles')).toEqual([
      { event: '*', schema: 'public', table: 'profiles', filter: 'id=eq.member-1' },
    ])
  })

  it('rebuilds the channel with a new topic when a page registers on navigation, and removes the old one', async () => {
    const view = await mount()
    const firstChannel = view.channel
    expect(mocks.client.channel).toHaveBeenCalledTimes(1)

    const secondChannel = await rebuild(view, [{ table: 'bets', filter: 'market_id=eq.market-1' }])

    expect(mocks.client.channel).toHaveBeenCalledTimes(2)
    expect(secondChannel.topic).not.toBe(firstChannel.topic)
    expect(secondChannel.handlersByTable.has('bets')).toBe(true)
    expect(secondChannel.handlersByTable.has('profiles')).toBe(true)
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(firstChannel)
  })

  it('does not rebuild when a re-render carries the same declarations under a new array', async () => {
    const subs: LiveSubscription[] = [{ table: 'bets', filter: 'market_id=eq.market-1' }]
    const view = await mount(subs)
    const channelCallsAfterMount = mocks.client.channel.mock.calls.length
    const removeCallsAfterMount = mocks.client.removeChannel.mock.calls.length

    // A fresh array with identical content, exactly like a server re-render's props.
    await rebuild(view, [{ table: 'bets', filter: 'market_id=eq.market-1' }])

    expect(mocks.client.channel).toHaveBeenCalledTimes(channelCallsAfterMount)
    expect(mocks.client.removeChannel).toHaveBeenCalledTimes(removeCallsAfterMount)
  })

  it('refreshes once, 400ms after the last change in a burst across tables', async () => {
    const { channel } = await mount([{ table: 'bets' }])

    fireChange(channel, 'profiles')
    vi.advanceTimersByTime(200)
    fireChange(channel, 'bets')
    vi.advanceTimersByTime(399)
    expect(mocks.refresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes at least every 2s under a continuous stream of changes', async () => {
    const { channel } = await mount()

    // Each change lands well inside the 400ms trailing window, so without a cap the debounce
    // would never fire.
    for (let i = 0; i < 6; i++) {
      fireChange(channel, 'profiles')
      vi.advanceTimersByTime(300)
    }
    expect(mocks.refresh).not.toHaveBeenCalled()

    fireChange(channel, 'profiles')
    vi.advanceTimersByTime(200)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)

    // The cap resets after it fires: a further burst waits out its own debounce again.
    fireChange(channel, 'profiles')
    vi.advanceTimersByTime(399)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
  })

  it('skips the refresh for a change while the tab is hidden, then catches up once on return', async () => {
    const { channel } = await mount()

    setVisibility('hidden')
    fireChange(channel, 'profiles')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('skips a maxWait tick while hidden too, and still catches up once on return', async () => {
    const { channel } = await mount()

    setVisibility('hidden')
    for (let i = 0; i < 7; i++) {
      fireChange(channel, 'profiles')
      vi.advanceTimersByTime(300)
    }
    expect(mocks.refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes after a reconnect, but not on the first join', async () => {
    const { channel } = await mount()

    channel.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).not.toHaveBeenCalled()

    channel.report('CLOSED')
    channel.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('treats the first SUBSCRIBED of a rebuilt channel as a join, not a reconnect', async () => {
    const view = await mount()

    const rebuiltChannel = await rebuild(view, [{ table: 'bets', filter: 'market_id=eq.market-1' }])

    rebuiltChannel.report('SUBSCRIBED')
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
    const { channel } = await mount()
    channel.report('SUBSCRIBED')

    document.dispatchEvent(new Event('visibilitychange'))
    channel.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)

    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('removes the channel, the listener and any pending refresh on unmount', async () => {
    const { unmount, channel } = await mount()
    fireChange(channel, 'profiles')

    unmount()
    vi.advanceTimersByTime(400)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)

    expect(mocks.client.removeChannel).toHaveBeenCalledWith(channel)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('opens no channel when it unmounts before the client has loaded', async () => {
    const { unmount } = render(<Harness />)
    unmount()
    await act(() => vi.dynamicImportSettled())

    expect(mocks.browserClient).not.toHaveBeenCalled()
    expect(mocks.client.channel).not.toHaveBeenCalled()
  })
})
