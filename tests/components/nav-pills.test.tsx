// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HTMLAttributes } from 'react'
import { render, screen, within } from '@testing-library/react'
import { ICON_POP, PILL_TRANSITION } from '@/lib/ui/motion'

let pathname = '/markets'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('@number-flow/react', () => ({ default: ({ value }: { value: number }) => String(value) }))

// Motion's layout animation can't run in jsdom; what matters is that each pill is one shared
// layoutId with the shared slide, so Motion moves it instead of drawing a new one.
type MotionProps = { layoutId?: string; transition?: unknown; initial?: unknown; animate?: { scale: unknown } }
type SpanProps = HTMLAttributes<HTMLSpanElement> & MotionProps
const { spans } = vi.hoisted(() => ({ spans: [] as MotionProps[] }))
vi.mock('motion/react-m', () => ({
  span: ({ layoutId, transition, initial, animate, ...props }: SpanProps) => {
    spans.push({ layoutId, transition, initial, animate })
    return <span data-layout-id={layoutId} data-pop={animate ? JSON.stringify(animate.scale) : undefined} {...props} />
  },
}))

import { AppNav } from '@/components/app-nav/app-nav'

function Nav() {
  return <AppNav balance={120} adminHref={null} me={{ id: 'me-1', name: 'Grace', avatarSrc: null }} />
}

function tabBar() {
  return screen.getAllByRole('navigation', { name: 'Primary' })[1]
}

beforeEach(() => {
  pathname = '/markets'
  spans.length = 0
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})

describe('the nav pills (#154)', () => {
  it('draws one tab bar pill, in the current tab, behind its icon', () => {
    render(<Nav />)
    const [pill, ...rest] = tabBar().querySelectorAll('[data-layout-id="tabbar-pill"]')
    expect(rest).toHaveLength(0)
    expect(pill).toHaveClass('bg-tab-active', 'absolute', 'inset-0', '-z-10')
    expect(pill.closest('a')).toHaveAttribute('aria-current', 'page')
    expect(pill.closest('a')).toHaveAttribute('href', '/markets')
  })

  it('moves the same pill to the next tab rather than drawing a second', () => {
    const { rerender } = render(<Nav />)
    pathname = '/feed'
    rerender(<Nav />)
    const found = tabBar().querySelectorAll('[data-layout-id="tabbar-pill"]')
    expect(found).toHaveLength(1)
    expect(found[0].closest('a')).toHaveAttribute('href', '/feed')
    expect(within(tabBar()).getByRole('link', { name: 'Markets' }).querySelector('.bg-tab-active')).toBeNull()
  })

  it('slides the tab bar and desktop pills the same way', () => {
    render(<Nav />)
    const byId = new Map(spans.map((p) => [p.layoutId, p.transition]))
    expect(byId.get('tabbar-pill')).toBe(PILL_TRANSITION)
    expect(byId.get('nav-pill')).toBe(PILL_TRANSITION)
  })

  it('pops the newly active icon, never on first render', () => {
    render(<Nav />)
    const pops = spans.filter((s) => s.animate)
    expect(pops).toHaveLength(5)
    for (const pop of pops) {
      expect(pop.initial).toBe(false)
      expect(pop.transition).toBe(ICON_POP)
    }
    const markets = within(tabBar()).getByRole('link', { name: 'Markets' })
    expect(markets.querySelector('[data-pop]')).toHaveAttribute('data-pop', '[1,1.18,1]')
    expect(within(tabBar()).getByRole('link', { name: 'Feed' }).querySelector('[data-pop]')).toHaveAttribute('data-pop', '1')
  })

  it('eases the label weight instead of snapping it', () => {
    render(<Nav />)
    const label = within(within(tabBar()).getByRole('link', { name: 'Markets' })).getByText('Markets')
    expect(label).toHaveClass('font-extrabold', 'transition-[font-weight]', 'motion-reduce:transition-none')
    expect(within(within(tabBar()).getByRole('link', { name: 'Feed' })).getByText('Feed')).toHaveClass('font-bold')
  })

  it('draws no pill on a page outside every tab', () => {
    pathname = '/members/me-1'
    render(<Nav />)
    expect(tabBar().querySelector('[data-layout-id="tabbar-pill"]')).toBeNull()
  })
})
