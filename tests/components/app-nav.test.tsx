// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ refresh }) }))
vi.mock('@/lib/theme/set-theme', () => ({ setThemeAction: vi.fn() }))

import { AppNav } from '@/components/app-nav/app-nav'

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

beforeEach(() => {
  pathname = '/'
  refresh.mockClear()
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }))
})

// jsdom applies no CSS, so both the desktop and the phone navs are visible to these queries.
describe('AppNav', () => {
  it('links every destination in both navs', () => {
    render(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    const [desktop, phone] = screen.getAllByRole('navigation', { name: 'Primary' })
    for (const name of ['Home', 'Markets', 'Parlays', 'Tasks', 'Feed', 'Leaderboard']) {
      expect(within(desktop).getByRole('link', { name })).toBeInTheDocument()
      expect(within(phone).getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('shows the short Leaders label on the phone tab but names it Leaderboard', () => {
    render(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    const phone = screen.getAllByRole('navigation', { name: 'Primary' })[1]
    const tab = within(phone).getByRole('link', { name: 'Leaderboard' })
    expect(tab).toHaveTextContent('Leaders')
  })

  it('names the Parlays link with the slip count, and drops it when the slip is empty', () => {
    const { rerender } = render(<AppNav balance={120} slipCount={2} isAdmin={false} />)
    expect(screen.getAllByRole('link', { name: 'Parlays (2)' })).toHaveLength(2)
    rerender(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    expect(screen.getAllByRole('link', { name: 'Parlays' })).toHaveLength(2)
  })

  it('marks the current section in both navs', () => {
    pathname = '/markets/3f2a'
    render(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    for (const link of screen.getAllByRole('link', { name: 'Markets' })) {
      expect(link).toHaveAttribute('aria-current', 'page')
    }
    for (const link of screen.getAllByRole('link', { name: 'Home' })) {
      expect(link).not.toHaveAttribute('aria-current')
    }
  })

  it('gives the desktop parlays badge the lime pill in light mode always, and swaps to primary only when active in dark mode', () => {
    pathname = '/parlays'
    const { rerender } = render(<AppNav balance={120} slipCount={2} isAdmin={false} />)
    const desktop = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    const activeBadge = within(desktop).getByText('2')
    expect(activeBadge).toHaveClass('bg-lime', 'text-on-lime', 'dark:bg-on-primary', 'dark:text-primary')

    pathname = '/'
    rerender(<AppNav balance={120} slipCount={2} isAdmin={false} />)
    const inactiveBadge = within(desktop).getByText('2')
    expect(inactiveBadge).toHaveClass('bg-lime', 'text-on-lime')
    expect(inactiveBadge).not.toHaveClass('dark:bg-on-primary', 'dark:text-primary')
  })

  it('shows Admin only to admins', () => {
    const { rerender } = render(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull()
    rerender(<AppNav balance={120} slipCount={0} isAdmin />)
    const adminLinks = screen.getAllByRole('link', { name: 'Admin' })
    expect(adminLinks.length).toBeGreaterThanOrEqual(2)
    for (const link of adminLinks) expect(link).toHaveAttribute('href', '/admin/invites')
  })

  it('shows the balance without the home page\'s "Balance:" wording', () => {
    render(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    const chips = screen.getAllByText('Balance 120 DC')
    expect(chips.length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText(/Balance: \d+ DC/)).toBeNull()
  })

  it('offers the wordmark and the theme toggle', () => {
    render(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    expect(screen.getAllByRole('link', { name: 'DwellDuel home' }).length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByRole('button', { name: /Switch to (dark|light) theme/ }).length).toBeGreaterThanOrEqual(2)
  })

  it('offers a skip-to-content link as the first link on the page', () => {
    render(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAccessibleName('Skip to content')
    expect(links[0]).toHaveAttribute('href', '#main')
  })

  it('refreshes when the tab becomes visible again, not when it hides', () => {
    render(<AppNav balance={120} slipCount={0} isAdmin={false} />)

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(refresh).toHaveBeenCalledOnce()
  })
})
