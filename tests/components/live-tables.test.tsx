// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { memo, useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { LiveTables, LiveTablesProvider, subscriptionKey, usePageSubscriptions, useLiveBaseSubscription } from '@/components/live/live-tables'

function Probe() {
  const subscriptions = usePageSubscriptions()
  const base = useLiveBaseSubscription()
  return <output aria-label="Subscriptions">{JSON.stringify({ base, subscriptions })}</output>
}

function readProbe() {
  return JSON.parse(screen.getByLabelText('Subscriptions').textContent!)
}

describe('LiveTablesProvider / LiveTables / usePageSubscriptions / useLiveBaseSubscription', () => {
  it('starts with no page subscriptions and a fixed base, and registers a page on mount', () => {
    function Wrapper({ active }: { active: boolean }) {
      return (
        <LiveTablesProvider userId="member-1">
          <Probe />
          {active && <LiveTables subscriptions={[{ table: 'bets', filter: 'market_id=eq.market-1' }]} />}
        </LiveTablesProvider>
      )
    }

    const { rerender } = render(<Wrapper active={false} />)
    expect(readProbe()).toEqual({ base: { table: 'profiles', filter: 'id=eq.member-1' }, subscriptions: [] })

    rerender(<Wrapper active={true} />)
    expect(readProbe()).toEqual({
      base: { table: 'profiles', filter: 'id=eq.member-1' },
      subscriptions: [{ table: 'bets', filter: 'market_id=eq.market-1' }],
    })
  })

  it('unregisters on unmount', () => {
    function Wrapper({ active }: { active: boolean }) {
      return (
        <LiveTablesProvider userId="member-1">
          <Probe />
          {active && <LiveTables subscriptions={[{ table: 'bets', filter: 'market_id=eq.market-1' }]} />}
        </LiveTablesProvider>
      )
    }

    const { rerender } = render(<Wrapper active={true} />)
    expect(readProbe().subscriptions).toHaveLength(1)

    rerender(<Wrapper active={false} />)
    expect(readProbe().subscriptions).toEqual([])
  })

  it('dedupes an identical table and filter registered by more than one page component', () => {
    render(
      <LiveTablesProvider userId="member-1">
        <Probe />
        <LiveTables subscriptions={[{ table: 'bets', filter: 'market_id=eq.market-1' }, { table: 'markets' }]} />
        <LiveTables subscriptions={[{ table: 'bets', filter: 'market_id=eq.market-1' }]} />
      </LiveTablesProvider>,
    )

    expect(readProbe().subscriptions).toEqual([
      { table: 'bets', filter: 'market_id=eq.market-1' },
      { table: 'markets' },
    ])
  })

  it('is a no-op outside a provider: nothing throws, page subscriptions read [], and base reads null', () => {
    expect(() => render(<LiveTables subscriptions={[{ table: 'bets' }]} />)).not.toThrow()

    render(<Probe />)
    expect(readProbe()).toEqual({ base: null, subscriptions: [] })
  })

  it('keeps a stable key across re-renders, so an equal-content array never re-notifies subscribers', () => {
    // Counting happens in an effect, not in the render body: an effect is where React expects a
    // side effect like this, and it still fires exactly once per commit that actually renders
    // CountingProbe (mount, plus one per genuine store notification).
    const renderCount = { current: 0 }
    const CountingProbe = memo(function CountingProbe() {
      usePageSubscriptions()
      useEffect(() => {
        renderCount.current += 1
      })
      return null
    })

    function Wrapper() {
      return (
        <LiveTablesProvider userId="member-1">
          <CountingProbe />
          <LiveTables subscriptions={[{ table: 'bets' }]} />
        </LiveTablesProvider>
      )
    }

    const { rerender } = render(<Wrapper />)
    // The first render shows no page subscriptions yet; <LiveTables> then registers 'bets' from
    // its mount effect, which is one genuine change and so one further, expected notification.
    const rendersAfterMount = renderCount.current
    expect(rendersAfterMount).toBeGreaterThan(0)

    // Each further render passes a brand new array literal with the same content, exactly as a
    // server component's props do on every request. None of these should add another notification.
    rerender(<Wrapper />)
    rerender(<Wrapper />)

    expect(renderCount.current).toBe(rendersAfterMount)
  })
})

describe('subscriptionKey', () => {
  it('is the same string for equal entries regardless of input order', () => {
    const a = subscriptionKey([{ table: 'bets', filter: 'market_id=eq.1' }, { table: 'markets' }])
    const b = subscriptionKey([{ table: 'markets' }, { table: 'bets', filter: 'market_id=eq.1' }])
    expect(a).toBe(b)
  })

  it('differs when a filter differs', () => {
    const a = subscriptionKey([{ table: 'bets', filter: 'market_id=eq.1' }])
    const b = subscriptionKey([{ table: 'bets', filter: 'market_id=eq.2' }])
    expect(a).not.toBe(b)
  })

  it('collapses duplicate entries', () => {
    const withDupe = subscriptionKey([{ table: 'markets' }, { table: 'markets' }])
    const without = subscriptionKey([{ table: 'markets' }])
    expect(withDupe).toBe(without)
  })
})
