// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

type NumberFlowProps = { value: number; suffix?: string; locales?: unknown; format?: { useGrouping?: boolean } }
const { numberFlowCalls } = vi.hoisted(() => ({ numberFlowCalls: [] as NumberFlowProps[] }))
let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
const { tap } = vi.hoisted(() => ({ tap: vi.fn() }))
vi.mock('@/lib/haptics', () => ({ haptics: { tap, success: vi.fn(), error: vi.fn() } }))
vi.mock('@number-flow/react', () => ({
  default: (props: NumberFlowProps) => {
    numberFlowCalls.push(props)
    return `${props.value}${props.suffix ?? ''}`
  },
}))

import { AppNav } from '@/components/app-nav/app-nav'

const ME = { id: 'me-1', name: 'Grace', avatarSrc: null }

function Nav({ balance, isAdmin, avatarSrc = null }: { balance: number; isAdmin: boolean; avatarSrc?: string | null }) {
  return <AppNav balance={balance} adminHref={isAdmin ? '/admin/invites' : null} me={{ ...ME, avatarSrc }} />
}

beforeEach(() => {
  pathname = '/'
  tap.mockClear()
  numberFlowCalls.length = 0
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
  it('names the top bars and the tab bar so page transitions leave them in place', () => {
    render(<Nav balance={120} isAdmin={false} />)
    const [desktopBar, phoneBar] = screen.getAllByRole('banner')
    const [, tabs] = screen.getAllByRole('navigation', { name: 'Primary' })
    expect(desktopBar.style.viewTransitionName).toBe('app-header')
    expect(phoneBar.style.viewTransitionName).toBe('app-topbar')
    expect(tabs.style.viewTransitionName).toBe('app-tabbar')
  })

  it('gives every nav link a hidden pending hint that adds nothing to its name', () => {
    render(<Nav balance={120} isAdmin />)
    const links = [
      ...screen.getAllByRole('navigation', { name: 'Primary' }).flatMap((nav) => within(nav).getAllByRole('link')),
      within(screen.getAllByRole('banner')[1]).getByRole('link', { name: 'Admin' }),
    ]
    expect(links).toHaveLength(12)
    for (const link of links) {
      const hint = link.querySelector('.nav-pending-hint')
      expect(hint).toHaveAttribute('aria-hidden', 'true')
      expect(hint).toBeEmptyDOMElement()
    }
  })

  it('links every destination in both navs', () => {
    render(<Nav balance={120} isAdmin={false} />)
    const [desktop, phone] = screen.getAllByRole('navigation', { name: 'Primary' })
    for (const name of ['Markets', 'My bets', 'Tasks', 'Feed', 'Leaderboard']) {
      expect(within(desktop).getByRole('link', { name })).toBeInTheDocument()
      expect(within(phone).getByRole('link', { name })).toBeInTheDocument()
    }
    // Home is the wordmark's job; parlays live on My bets.
    for (const nav of [desktop, phone]) {
      expect(within(nav).queryByRole('link', { name: 'Home' })).toBeNull()
      expect(within(nav).queryByRole('link', { name: 'Parlays' })).toBeNull()
    }
    expect(phone).toHaveClass('grid-cols-5')
  })

  // jsdom applies no CSS, so these pin the classes that make the desktop row fit from 768px: an
  // admin's full-label row needs ~1180px, so labels and the wordmark's name only show from xl / lg.
  it('keeps every desktop link a 44px icon until xl, still named by its label', () => {
    render(<Nav balance={120} isAdmin />)
    const desktop = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    for (const name of ['Markets', 'My bets', 'Tasks', 'Feed', 'Leaderboard', 'Admin']) {
      const link = within(desktop).getByRole('link', { name })
      expect(link).toHaveClass('min-h-11', 'min-w-11')
      expect(link).toHaveAttribute('title', name)
      expect(within(link).getByText(name)).toHaveClass('max-xl:sr-only')
      expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
    // Admin keeps its icon beside the label from xl; the section links drop theirs.
    expect(within(desktop).getByRole('link', { name: 'Markets' }).querySelector('svg')).toHaveClass('xl:hidden')
    expect(within(desktop).getByRole('link', { name: 'Admin' }).querySelector('svg')).not.toHaveClass('xl:hidden')
  })

  it("drops the desktop wordmark's name below lg, but not the phone's, keeping both links named", () => {
    render(<Nav balance={120} isAdmin={false} />)
    const [desktopHome, phoneHome] = screen.getAllByRole('link', { name: 'DwellDuel home' })
    expect(desktopHome.querySelector('span')).toHaveClass('max-lg:hidden')
    expect(phoneHome.querySelector('span')).not.toHaveClass('max-lg:hidden')
  })

  it('shows the short Leaders label on the phone tab but names it Leaderboard', () => {
    render(<Nav balance={120} isAdmin={false} />)
    const phone = screen.getAllByRole('navigation', { name: 'Primary' })[1]
    const tab = within(phone).getByRole('link', { name: 'Leaderboard' })
    expect(tab).toHaveTextContent('Leaders')
  })


  it('marks the current section in both navs', () => {
    pathname = '/markets/3f2a'
    render(<Nav balance={120} isAdmin={false} />)
    for (const link of screen.getAllByRole('link', { name: 'Markets' })) {
      expect(link).toHaveAttribute('aria-current', 'page')
    }
    for (const link of screen.getAllByRole('link', { name: 'DwellDuel home' })) {
      expect(link).not.toHaveAttribute('aria-current')
    }
  })

  it('marks the wordmark current on Home, where no tab is', () => {
    pathname = '/'
    render(<Nav balance={120} isAdmin={false} />)
    for (const link of screen.getAllByRole('link', { name: 'DwellDuel home' })) {
      expect(link).toHaveAttribute('aria-current', 'page')
    }
    for (const nav of screen.getAllByRole('navigation', { name: 'Primary' })) {
      expect(within(nav).queryAllByRole('link').filter((l) => l.hasAttribute('aria-current'))).toEqual([])
    }
  })


  it('shows Admin only to admins', () => {
    const { rerender } = render(<Nav balance={120} isAdmin={false} />)
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull()
    rerender(<Nav balance={120} isAdmin />)
    const adminLinks = screen.getAllByRole('link', { name: 'Admin' })
    expect(adminLinks.length).toBeGreaterThanOrEqual(2)
    for (const link of adminLinks) expect(link).toHaveAttribute('href', '/admin/invites')
  })

  it('makes the balance a link to My bets in both top bars, marked current there', () => {
    const { unmount } = render(<Nav balance={120} isAdmin={false} />)
    const chips = screen.getAllByRole('link', { name: 'Balance 120 DC, view my bets' })
    expect(chips).toHaveLength(2)
    for (const chip of chips) {
      expect(chip).toHaveAttribute('href', '/bets')
      expect(chip).toHaveClass('min-h-11', 'pressable', 'no-underline')
      expect(chip).not.toHaveAttribute('aria-current')
    }
    unmount()
    pathname = '/bets'
    render(<Nav balance={120} isAdmin={false} />)
    for (const chip of screen.getAllByRole('link', { name: 'Balance 120 DC, view my bets' })) {
      expect(chip).toHaveAttribute('aria-current', 'page')
    }
  })

  it('links your photo, or your initial, to your profile in both top bars', () => {
    const { unmount } = render(<Nav balance={120} isAdmin={false} />)
    const links = screen.getAllByRole('link', { name: 'Your profile' })
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/members/me-1')
      expect(link).toHaveClass('size-11')
      expect(link).toHaveTextContent('G')
    }
    unmount()
    render(<Nav balance={120} isAdmin={false} avatarSrc="https://example.com/grace.jpg" />)
    for (const link of screen.getAllByRole('link', { name: 'Your profile' })) {
      expect(link.querySelector('img')).toHaveAttribute('src', 'https://example.com/grace.jpg')
    }
  })

  it('marks the avatar, not the Leaderboard tab, on your own profile', () => {
    pathname = '/members/me-1'
    const { unmount } = render(<Nav balance={120} isAdmin={false} />)
    for (const link of screen.getAllByRole('link', { name: 'Your profile' })) expect(link).toHaveAttribute('aria-current', 'page')
    for (const link of screen.getAllByRole('link', { name: 'Leaderboard' })) expect(link).not.toHaveAttribute('aria-current')
    unmount()
    pathname = '/members/someone-else'
    render(<Nav balance={120} isAdmin={false} />)
    for (const link of screen.getAllByRole('link', { name: 'Your profile' })) expect(link).not.toHaveAttribute('aria-current')
    for (const link of screen.getAllByRole('link', { name: 'Leaderboard' })) expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('formats the balance as plain digits, in en-US regardless of the browser locale', () => {
    render(<Nav balance={1250} isAdmin={false} />)
    expect(numberFlowCalls.length).toBeGreaterThanOrEqual(2)
    for (const call of numberFlowCalls) {
      expect(call.locales).toBe('en-US')
      expect(call.format?.useGrouping).toBe(false)
    }
  })

  it('offers the wordmark, and leaves the theme to Settings', () => {
    render(<Nav balance={120} isAdmin={false} />)
    expect(screen.getAllByRole('link', { name: 'DwellDuel home' }).length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByRole('button', { name: /theme/ })).toBeNull()
  })

  it('keeps the phone chrome inside the installed app\'s safe area', () => {
    render(<Nav balance={120} isAdmin />)
    for (const header of screen.getAllByRole('banner')) expect(header).toHaveClass('sticky', 'top-(--safe-top)')
    const phone = screen.getAllByRole('navigation', { name: 'Primary' })[1]
    expect(phone).toHaveClass('fixed', 'bottom-0', 'pb-[calc(12px+var(--safe-bottom))]')
  })

  it('keeps the nav off the long-press menu and gives every nav control a press state', () => {
    render(<Nav balance={120} isAdmin />)
    for (const header of screen.getAllByRole('banner')) expect(header).toHaveClass('no-callout')
    const [desktop, phone] = screen.getAllByRole('navigation', { name: 'Primary' })
    expect(phone).toHaveClass('no-callout')
    for (const link of [...within(desktop).getAllByRole('link'), ...within(phone).getAllByRole('link')]) {
      expect(link).toHaveClass('pressable')
    }
    for (const link of screen.getAllByRole('link', { name: 'Your profile' })) expect(link).toHaveClass('pressable')
  })

  it('offers a skip-to-content link as the first link on the page', () => {
    render(<Nav balance={120} isAdmin={false} />)
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAccessibleName('Skip to content')
    expect(links[0]).toHaveAttribute('href', '#main')
  })


  it('shows the Beta badge beside the wordmark in both headers, without changing the home link name', () => {
    render(<Nav balance={120} isAdmin={false} />)
    const homeLinks = screen.getAllByRole('link', { name: 'DwellDuel home' })
    expect(homeLinks).toHaveLength(2)
    for (const link of homeLinks) expect(link).not.toHaveTextContent('Beta')
    expect(screen.getAllByText('Beta')).toHaveLength(2)
  })

  it('taps on a phone tab press, and not on a desktop link', () => {
    // Cancelled before React sees the click, so jsdom never attempts the real navigation.
    const cancel = (event: Event) => event.preventDefault()
    window.addEventListener('click', cancel, true)
    try {
      render(<Nav balance={120} isAdmin={false} />)
      const [desktop, phone] = screen.getAllByRole('navigation', { name: 'Primary' })
      fireEvent.click(within(desktop).getByRole('link', { name: 'Markets' }))
      expect(tap).not.toHaveBeenCalled()
      fireEvent.click(within(phone).getByRole('link', { name: 'Markets' }))
      expect(tap).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener('click', cancel, true)
    }
  })
})
