// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'

let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

type NavDepthModule = typeof import('@/lib/nav/nav-depth')
let mod: NavDepthModule
let scrollTo: ReturnType<typeof vi.fn>

// The count lives in module scope, so each test loads a fresh copy of the module.
beforeEach(async () => {
  vi.resetModules()
  mod = await import('@/lib/nav/nav-depth')
  pathname = '/'
  window.history.replaceState(null, '', '/')
  scrollTo = vi.fn()
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo
})

function Harness() {
  const depth = mod.useNavDepth()
  return (
    <>
      <mod.NavDepthTracker />
      <output>{depth}</output>
    </>
  )
}

function navigate(rerender: (ui: React.ReactElement) => void, to: string) {
  pathname = to
  window.history.pushState(null, '', to)
  rerender(<Harness />)
}

// Simulates a browser traversal: the real browser restores the landed-on entry's own state
// before firing popstate, and the tracker reads window.history.state directly, so the test sets
// it to whatever that entry last stored. Omitting `state` simulates an entry with nothing stored.
function goBack(rerender: (ui: React.ReactElement) => void, to: string, state: { ddDepth: number } | null = null) {
  pathname = to
  window.history.replaceState(state, '', to)
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  rerender(<Harness />)
}

// A forward traversal fires the same bare popstate a back traversal does -- there's no way to
// tell them apart -- so the same simulation covers both.
const goForward = goBack

const depth = () => screen.getByRole('status').textContent

describe('nav depth', () => {
  it('starts at 0 on a fresh load or deep link', () => {
    pathname = '/markets/3f2a'
    render(<Harness />)
    expect(depth()).toBe('0')
  })

  it('counts each in-app forward navigation', () => {
    const { rerender } = render(<Harness />)
    navigate(rerender, '/markets')
    expect(depth()).toBe('1')
    navigate(rerender, '/markets/3f2a')
    expect(depth()).toBe('2')
  })

  it('counts a back navigation down again', () => {
    const { rerender } = render(<Harness />)
    navigate(rerender, '/markets')
    navigate(rerender, '/markets/3f2a')
    goBack(rerender, '/markets', { ddDepth: 1 })
    expect(depth()).toBe('1')
    goBack(rerender, '/', { ddDepth: 0 })
    expect(depth()).toBe('0')
  })

  it('trusts the landed-on entry\'s own stored depth on a multi-entry back traversal', () => {
    const { rerender } = render(<Harness />)
    navigate(rerender, '/markets')
    navigate(rerender, '/markets/3f2a')
    // The long-press back menu or history.go(-n) can skip straight past an intermediate entry;
    // only one popstate fires, so subtracting 1 from a depth of 2 would wrongly give 1.
    goBack(rerender, '/', { ddDepth: 0 })
    expect(depth()).toBe('0')
  })

  it('resumes from a depth already stored on the history entry at mount', () => {
    window.history.replaceState({ ddDepth: 3 }, '', '/markets/3f2a')
    pathname = '/markets/3f2a'
    render(<Harness />)
    expect(depth()).toBe('3')
  })

  it('reads the stored value on a forward traversal too', () => {
    const { rerender } = render(<Harness />)
    navigate(rerender, '/markets')
    navigate(rerender, '/markets/3f2a')
    goBack(rerender, '/markets', { ddDepth: 1 })
    expect(depth()).toBe('1')
    goForward(rerender, '/markets/3f2a', { ddDepth: 2 })
    expect(depth()).toBe('2')
  })

  it('never goes below 0', () => {
    pathname = '/markets/3f2a'
    const { rerender } = render(<Harness />)
    goBack(rerender, '/markets')
    expect(depth()).toBe('0')
  })

  it('ignores re-renders on the same pathname', () => {
    const { rerender } = render(<Harness />)
    navigate(rerender, '/feed')
    rerender(<Harness />)
    rerender(<Harness />)
    expect(depth()).toBe('1')
  })

  it('ignores a popstate that keeps the pathname, so the next push still counts up', () => {
    const { rerender } = render(<Harness />)
    navigate(rerender, '/feed')
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    navigate(rerender, '/leaderboard')
    expect(depth()).toBe('2')
  })

  it('shares one count between every reader', () => {
    function Reader() {
      return <span data-testid="reader">{mod.useNavDepth()}</span>
    }
    const { rerender } = render(
      <>
        <Harness />
        <Reader />
      </>,
    )
    pathname = '/markets'
    rerender(
      <>
        <Harness />
        <Reader />
      </>,
    )
    expect(screen.getByTestId('reader')).toHaveTextContent('1')
  })
})

describe('scroll on navigation (#349)', () => {
  const TOP = { top: 0, left: 0, behavior: 'instant' }

  it('opens a pushed page at its top', () => {
    const { rerender } = render(<Harness />)
    expect(scrollTo).not.toHaveBeenCalled()
    navigate(rerender, '/markets')
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(TOP)
  })

  it('leaves back and forward to the position the browser restores', () => {
    const { rerender } = render(<Harness />)
    navigate(rerender, '/markets')
    scrollTo.mockClear()
    goBack(rerender, '/', { ddDepth: 0 })
    goForward(rerender, '/markets', { ddDepth: 1 })
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('leaves a #hash link to scroll to its target', () => {
    const { rerender } = render(<Harness />)
    pathname = '/how-it-works'
    window.history.pushState(null, '', '/how-it-works#parlays')
    rerender(<Harness />)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('stays put on a re-render of the same page', () => {
    const { rerender } = render(<Harness />)
    rerender(<Harness />)
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
