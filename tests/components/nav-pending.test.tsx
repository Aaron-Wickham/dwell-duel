// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'

const state = vi.hoisted(() => ({ pathname: '/markets', pendingHref: null as string | null }))
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }))
vi.mock('@number-flow/react', () => ({ default: ({ value }: { value: number }) => String(value) }))
vi.mock('motion/react-m', () => ({
  span: ({ layoutId, transition: _t, ...props }: { layoutId?: string; transition?: unknown }) => (
    <span data-layout-id={layoutId} {...props} />
  ),
}))

// Each Link tells its descendants its href, so useLinkStatus can say which one is navigating; the
// transition types land on the anchor for the assertions below.
vi.mock('next/link', async () => {
  const React = await import('react')
  const Href = React.createContext<string | null>(null)
  return {
    default: ({
      href,
      prefetch: _prefetch,
      transitionTypes,
      children,
      ...props
    }: { href: string; prefetch?: unknown; transitionTypes?: string[]; children: ReactNode }) => (
      <Href.Provider value={href}>
        <a href={href} data-transition-types={transitionTypes?.join(' ')} {...props}>
          {children}
        </a>
      </Href.Provider>
    ),
    useLinkStatus: () => ({ pending: React.useContext(Href) === state.pendingHref }),
  }
})

import { AppNav } from '@/components/app-nav/app-nav'
import { SubNav } from '@/components/ui/sub-nav'

function Nav() {
  return <AppNav balance={120} adminHref="/admin/invites" me={{ id: 'me-1', name: 'Grace', avatarSrc: null }} />
}

const desktop = () => screen.getAllByRole('navigation', { name: 'Primary' })[0]
const tabBar = () => screen.getAllByRole('navigation', { name: 'Primary' })[1]
const pillIn = (nav: HTMLElement, id: string) => nav.querySelector(`[data-layout-id="${id}"]`)?.closest('a')

beforeEach(() => {
  state.pathname = '/markets'
  state.pendingHref = null
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})

// #384: a tab tap moves the pill at once, before the page arrives.
describe('the nav while a tab is on the way', () => {
  it('moves both pills to the tapped tab, and leaves aria-current on the page you are on', () => {
    state.pendingHref = '/feed'
    render(<Nav />)
    expect(pillIn(tabBar(), 'tabbar-pill')).toHaveAttribute('href', '/feed')
    expect(pillIn(desktop(), 'nav-pill')).toHaveAttribute('href', '/feed')
    expect(within(tabBar()).getByRole('link', { name: 'Feed' })).not.toHaveAttribute('aria-current')
    expect(within(tabBar()).getByRole('link', { name: 'Markets' })).toHaveAttribute('aria-current', 'page')
    expect(within(within(tabBar()).getByRole('link', { name: 'Feed' })).getByText('Feed')).toHaveClass('font-extrabold')
  })

  it('moves the pill to My bets when the balance chip is tapped', () => {
    state.pendingHref = '/bets'
    render(<Nav />)
    expect(pillIn(tabBar(), 'tabbar-pill')).toHaveAttribute('href', '/bets')
  })

  it('keeps the pill on the current page when nothing is on the way', () => {
    render(<Nav />)
    expect(pillIn(tabBar(), 'tabbar-pill')).toHaveAttribute('href', '/markets')
  })

  it('never dims a nav link: the pill is its pending state', () => {
    state.pendingHref = '/feed'
    render(<Nav />)
    expect(document.querySelector('[data-link-pending]')).toBeNull()
  })
})

// #384: a tab switch swaps at once; Admin is a drill-down and slides.
describe('nav transition types', () => {
  it('tags every tab, the balance chip and the wordmark nav-tab, and Admin nav-forward', () => {
    render(<Nav />)
    for (const link of within(tabBar()).getAllByRole('link')) expect(link).toHaveAttribute('data-transition-types', 'nav-tab')
    expect(within(desktop()).getByRole('link', { name: 'Markets' })).toHaveAttribute('data-transition-types', 'nav-tab')
    expect(within(desktop()).getByRole('link', { name: 'Admin' })).toHaveAttribute('data-transition-types', 'nav-forward')
    for (const chip of screen.getAllByRole('link', { name: /^Balance/ })) expect(chip).toHaveAttribute('data-transition-types', 'nav-tab')
    for (const home of screen.getAllByRole('link', { name: 'DwellDuel home' })) expect(home).toHaveAttribute('data-transition-types', 'nav-tab')
  })

  it('tags SubNav’s tabs nav-tab', () => {
    render(
      <SubNav
        label="Bets"
        items={[
          { href: '/bets', label: 'Open', current: true },
          { href: '/bets?tab=settled', label: 'Settled', current: false },
        ]}
      />,
    )
    for (const link of screen.getAllByRole('link')) expect(link).toHaveAttribute('data-transition-types', 'nav-tab')
  })
})
