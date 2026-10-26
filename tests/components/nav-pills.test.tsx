// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HTMLAttributes } from 'react'
import { render, screen, within } from '@testing-library/react'
import { PILL_TRANSITION } from '@/lib/ui/motion'

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
  // D-1: a lime tile filling the tab's cell, a little inset from its neighbours, not a round pill.
  it('draws one tab bar tile, filling the current tab', () => {
    render(<Nav />)
    const [pill, ...rest] = tabBar().querySelectorAll('[data-layout-id="tabbar-pill"]')
    expect(rest).toHaveLength(0)
    expect(pill).toHaveClass('bg-lime', 'rounded-tile', 'absolute', 'inset-y-0', 'inset-x-0.5', '-z-10')
    expect(pill.parentElement).toHaveClass('isolate')
    expect(pill.closest('a')).toHaveAttribute('aria-current', 'page')
    expect(pill.closest('a')).toHaveAttribute('href', '/markets')
  })

  it('moves the same pill to the next tab rather than drawing a second', () => {
    const { rerender } = render(<Nav />)
    pathname = '/tasks'
    rerender(<Nav />)
    const found = tabBar().querySelectorAll('[data-layout-id="tabbar-pill"]')
    expect(found).toHaveLength(1)
    expect(found[0].closest('a')).toHaveAttribute('href', '/tasks')
    expect(within(tabBar()).getByRole('link', { name: 'Markets' }).querySelector('.bg-lime')).toBeNull()
  })

  it('slides the tab bar and desktop pills the same way', () => {
    render(<Nav />)
    const byId = new Map(spans.map((p) => [p.layoutId, p.transition]))
    expect(byId.get('tabbar-pill')).toBe(PILL_TRANSITION)
    expect(byId.get('nav-pill')).toBe(PILL_TRANSITION)
  })

  // #383: the pill's slide alone marks the tab; the icon doesn't pop as well.
  it('animates only the pills, never an icon', () => {
    render(<Nav />)
    expect(spans.filter((s) => s.animate)).toHaveLength(0)
    expect(spans.every((s) => s.layoutId === 'tabbar-pill' || s.layoutId === 'nav-pill')).toBe(true)
  })

  // #383: the label and icon change colour over the pill's slide, so it never covers one mid-way.
  it('cross-fades each link’s colour over the pill’s slide', () => {
    render(<Nav />)
    for (const link of within(tabBar()).getAllByRole('link')) expect(link).toHaveClass('pill-label')
    // The tile isn't the only cue: lime is 1.73:1 on the light surface, so the label and icon turn
    // ink and heavier too.
    const markets = within(tabBar()).getByRole('link', { name: 'Markets' })
    expect(markets).toHaveClass('text-on-lime')
    expect(markets.querySelector('svg')).toHaveAttribute('stroke-width', '2.5')
    const tasks = within(tabBar()).getByRole('link', { name: 'Tasks' })
    expect(tasks).toHaveClass('text-ink2')
    expect(tasks.querySelector('svg')).toHaveAttribute('stroke-width', '2')
    const desktop = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    for (const link of within(desktop).getAllByRole('link')) expect(link).toHaveClass('pill-label')
  })

  it('eases the label weight instead of snapping it', () => {
    render(<Nav />)
    const label = within(within(tabBar()).getByRole('link', { name: 'Markets' })).getByText('Markets')
    expect(label).toHaveClass('font-extrabold', 'transition-[font-weight]', 'motion-reduce:transition-none')
    expect(within(within(tabBar()).getByRole('link', { name: 'Tasks' })).getByText('Tasks')).toHaveClass('font-bold')
  })

  it('draws no pill on a page outside every tab', () => {
    pathname = '/settings'
    render(<Nav />)
    expect(tabBar().querySelector('[data-layout-id="tabbar-pill"]')).toBeNull()
  })
})
