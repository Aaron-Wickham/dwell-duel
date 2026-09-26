// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'

let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

type NavDepthModule = typeof import('@/lib/nav/nav-depth')
let mod: NavDepthModule

// The count lives in module scope, so each test loads a fresh copy of the module.
beforeEach(async () => {
  vi.resetModules()
  mod = await import('@/lib/nav/nav-depth')
  pathname = '/'
  window.history.replaceState(null, '', '/')
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

function goBack(rerender: (ui: React.ReactElement) => void, to: string) {
  pathname = to
  window.history.replaceState(null, '', to)
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  rerender(<Harness />)
}

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
    goBack(rerender, '/markets')
    expect(depth()).toBe('1')
    goBack(rerender, '/')
    expect(depth()).toBe('0')
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
