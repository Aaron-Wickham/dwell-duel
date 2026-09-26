// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'

type Status = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT'

const mocks = vi.hoisted(() => {
  const handlers: Array<() => void> = []
  const status: { report: (status: Status) => void } = { report: () => {} }
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, handler: () => void) => {
      handlers.push(handler)
      return channel
    }),
    subscribe: vi.fn((callback: (status: Status) => void) => {
      status.report = callback
      return channel
    }),
  }
  const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() }
  return { handlers, status, channel, client, browserClient: vi.fn(() => client), refresh: vi.fn() }
})

vi.mock('@/lib/supabase/client', () => ({ browserClient: mocks.browserClient }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import { LIVE_TABLES, LiveRefresh } from '@/components/live/live-refresh'

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

// The client loads through a dynamic import; timers are faked only once it has, so the import
// itself isn't held up.
async function mount() {
  const view = render(<LiveRefresh />)
  await act(() => vi.dynamicImportSettled())
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  return view
}

function fireChange() {
  mocks.handlers[0]()
}

beforeEach(() => {
  mocks.handlers.length = 0
  mocks.status.report = () => {}
  mocks.channel.on.mockClear()
  mocks.channel.subscribe.mockClear()
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
  it('renders nothing and opens one channel bound to changes on each live table', async () => {
    const { container } = await mount()

    expect(container).toBeEmptyDOMElement()
    expect(mocks.client.channel).toHaveBeenCalledTimes(1)
    expect(mocks.channel.on).toHaveBeenCalledTimes(LIVE_TABLES.length)
    for (const table of ['bets', 'markets', 'market_resolutions', 'parlays', 'parlay_legs', 'tasks', 'task_completions', 'profiles']) {
      expect(mocks.channel.on).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', table }, expect.any(Function))
    }
    expect(mocks.channel.subscribe).toHaveBeenCalledTimes(1)
  })

  it('refreshes once, 400ms after the last change in a burst', async () => {
    await mount()

    fireChange()
    vi.advanceTimersByTime(200)
    mocks.handlers[3]()
    vi.advanceTimersByTime(200)
    mocks.handlers[7]()
    vi.advanceTimersByTime(399)
    expect(mocks.refresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('skips the refresh for a change while the tab is hidden, then catches up once on return', async () => {
    await mount()

    setVisibility('hidden')
    fireChange()
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes after a reconnect, but not on the first join', async () => {
    await mount()

    mocks.status.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).not.toHaveBeenCalled()

    mocks.status.report('CLOSED')
    mocks.status.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
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
    await mount()
    mocks.status.report('SUBSCRIBED')

    document.dispatchEvent(new Event('visibilitychange'))
    mocks.status.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)

    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('removes the channel, the listener and any pending refresh on unmount', async () => {
    const { unmount } = await mount()
    fireChange()

    unmount()
    vi.advanceTimersByTime(400)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)

    expect(mocks.client.removeChannel).toHaveBeenCalledWith(mocks.channel)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('opens no channel when it unmounts before the client has loaded', async () => {
    const { unmount } = render(<LiveRefresh />)
    unmount()
    await act(() => vi.dynamicImportSettled())

    expect(mocks.browserClient).not.toHaveBeenCalled()
    expect(mocks.client.channel).not.toHaveBeenCalled()
  })
})
