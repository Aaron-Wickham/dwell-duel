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
type PillProps = HTMLAttributes<HTMLSpanElement> & { layoutId?: string; transition?: unknown }
const { pills } = vi.hoisted(() => ({ pills: [] as { layoutId?: string; transition?: unknown }[] }))
vi.mock('motion/react-m', () => ({
  span: ({ layoutId, transition, ...props }: PillProps) => {
    pills.push({ layoutId, transition })
    return <span data-layout-id={layoutId} {...props} />
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
  pills.length = 0
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
    expect(pill).toHaveClass('bg-lime', 'absolute', 'inset-0', '-z-10')
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
    expect(within(tabBar()).getByRole('link', { name: 'Markets' }).querySelector('.bg-lime')).toBeNull()
  })

  it('slides the tab bar and desktop pills the same way', () => {
    render(<Nav />)
    const byId = new Map(pills.map((p) => [p.layoutId, p.transition]))
    expect(byId.get('tabbar-pill')).toBe(PILL_TRANSITION)
    expect(byId.get('nav-pill')).toBe(PILL_TRANSITION)
  })

  it('draws no pill on a page outside every tab', () => {
    pathname = '/members/me-1'
    render(<Nav />)
    expect(tabBar().querySelector('[data-layout-id="tabbar-pill"]')).toBeNull()
  })
})
