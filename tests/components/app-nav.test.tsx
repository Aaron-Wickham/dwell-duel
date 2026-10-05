// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

function Nav({
  balance,
  isAdmin,
  avatarSrc = null,
  attention = 0,
}: {
  balance: number
  isAdmin: boolean
  avatarSrc?: string | null
  attention?: number
}) {
  return (
    <AppNav
      balance={balance}
      adminHref={isAdmin ? '/admin/invites' : null}
      adminAttention={attention}
      me={{ ...ME, avatarSrc }}
    />
  )
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
    const links = screen.getAllByRole('navigation', { name: 'Primary' }).flatMap((nav) => within(nav).getAllByRole('link'))
    expect(links).toHaveLength(10)
    for (const link of links) {
      const hint = link.querySelector('.nav-pending-hint')
      expect(hint).toHaveAttribute('aria-hidden', 'true')
      expect(hint).toBeEmptyDOMElement()
    }
  })

  it('links every destination in both navs', () => {
    render(<Nav balance={120} isAdmin={false} />)
    const [desktop, phone] = screen.getAllByRole('navigation', { name: 'Primary' })
    for (const name of ['Home', 'Markets', 'My bets', 'Tasks', 'Leaderboard']) {
      expect(within(desktop).getByRole('link', { name })).toBeInTheDocument()
      expect(within(phone).getByRole('link', { name: name === 'Leaderboard' ? 'Leaders, leaderboard' : name })).toBeInTheDocument()
    }
    // D1 (#385): the feed is Home's Activity, Admin opens from the avatar, parlays live on My bets.
    for (const nav of [desktop, phone]) {
      for (const name of ['Feed', 'Admin', 'Parlays']) expect(within(nav).queryByRole('link', { name })).toBeNull()
    }
    expect(within(desktop).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(phone).toHaveClass('grid-cols-5')
  })

  // jsdom applies no CSS, so these pin the classes that make the desktop row fit from 768px:
  // labels and the wordmark's name only show from xl / lg.
  it('keeps every desktop link a 44px icon until xl, still named by its label', () => {
    render(<Nav balance={120} isAdmin />)
    const desktop = screen.getAllByRole('navigation', { name: 'Primary' })[0]
    for (const name of ['Home', 'Markets', 'My bets', 'Tasks', 'Leaderboard']) {
      const link = within(desktop).getByRole('link', { name })
      expect(link).toHaveClass('min-h-11', 'min-w-11')
      expect(link).toHaveAttribute('title', name)
      expect(within(link).getByText(name)).toHaveClass('max-xl:sr-only')
      expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      expect(link.querySelector('svg')).toHaveClass('xl:hidden')
    }
  })

  it("drops the desktop wordmark's name below lg, but not the phone's, keeping both links named", () => {
    render(<Nav balance={120} isAdmin={false} />)
    const [desktopHome, phoneHome] = screen.getAllByRole('link', { name: 'DwellDuel home' })
    expect(desktopHome.querySelector('span')).toHaveClass('max-lg:hidden')
    expect(phoneHome.querySelector('span')).not.toHaveClass('max-lg:hidden')
  })

  it('shows the short Leaders label on the phone tab and keeps the word in its accessible name', () => {
    render(<Nav balance={120} isAdmin={false} />)
    const phone = screen.getAllByRole('navigation', { name: 'Primary' })[1]
    const tab = within(phone).getByRole('link', { name: 'Leaders, leaderboard' })
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

  it('marks the Home tab current on Home and on Activity, and never the wordmark', () => {
    for (const path of ['/', '/feed']) {
      pathname = path
      const { unmount } = render(<Nav balance={120} isAdmin={false} />)
      for (const nav of screen.getAllByRole('navigation', { name: 'Primary' })) {
        expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
      }
      for (const link of screen.getAllByRole('link', { name: 'DwellDuel home' })) expect(link).not.toHaveAttribute('aria-current')
      unmount()
    }
  })

  it('keeps the phone top bar to the wordmark, balance and avatar, for every role', () => {
    render(<Nav balance={120} isAdmin attention={3} />)
    const phoneBar = screen.getAllByRole('banner')[1]
    const links = within(phoneBar).getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAccessibleName('DwellDuel home')
    expect(links[1]).toHaveAccessibleName(/^Balance/)
    expect(within(phoneBar).getAllByRole('button')).toHaveLength(1)
  })

  it('offers Admin in the avatar menu only to reviewers and above', async () => {
    const { unmount } = render(<Nav balance={120} isAdmin={false} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Your profile and settings' })[1])
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /Your profile/ })).toHaveAttribute('href', '/members/me-1')
    expect(within(menu).getByRole('menuitem', { name: /Settings/ })).toHaveAttribute('href', '/settings')
    expect(within(menu).getByRole('menuitem', { name: /Send feedback/ }).getAttribute('href')).toMatch(/^mailto:/)
    expect(within(menu).queryByRole('menuitem', { name: /Admin/ })).toBeNull()
    for (const item of within(menu).getAllByRole('menuitem')) expect(item).toHaveClass('min-h-11')
    unmount()

    render(<Nav balance={120} isAdmin />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Your profile and settings' })[1])
    const adminMenu = await screen.findByRole('menu')
    expect(within(adminMenu).getByRole('menuitem', { name: /Admin/ })).toHaveAttribute('href', '/admin/invites')
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

  it('shows your photo, or your initial, on a 44px menu button in both top bars', () => {
    const { unmount } = render(<Nav balance={120} isAdmin={false} />)
    const buttons = screen.getAllByRole('button', { name: 'Your profile and settings' })
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      expect(button).toHaveClass('size-11', 'pressable')
      expect(button).toHaveTextContent('G')
    }
    unmount()
    render(<Nav balance={120} isAdmin={false} avatarSrc="https://example.com/grace.jpg" />)
    for (const button of screen.getAllByRole('button', { name: 'Your profile and settings' })) {
      expect(button.querySelector('img')).toHaveAttribute('src', 'https://example.com/grace.jpg')
    }
  })

  it('rings the avatar, not the Leaderboard tab, on your own profile', () => {
    pathname = '/members/me-1'
    const { unmount } = render(<Nav balance={120} isAdmin={false} />)
    for (const button of screen.getAllByRole('button', { name: 'Your profile and settings' })) expect(button.firstElementChild).toHaveClass('ring-2')
    for (const link of screen.getAllByRole('link', { name: /^(Leaders, leaderboard|Leaderboard)$/ })) expect(link).not.toHaveAttribute('aria-current')
    unmount()
    pathname = '/members/someone-else'
    render(<Nav balance={120} isAdmin={false} />)
    for (const button of screen.getAllByRole('button', { name: 'Your profile and settings' })) expect(button.firstElementChild).not.toHaveClass('ring-2')
    for (const link of screen.getAllByRole('link', { name: /^(Leaders, leaderboard|Leaderboard)$/ })) expect(link).toHaveAttribute('aria-current', 'page')
  })

  // #210: NumberFlow's script stays off every page's first load; the chip is text until the
  // balance moves, and then animates from the old figure.
  it('shows the balance as plain text until it first changes, then animates it from the old figure, grouped in en-US', async () => {
    const { rerender } = render(<Nav balance={1250} isAdmin={false} />)
    expect(screen.getAllByText('1,250 DC')).toHaveLength(2)
    expect(numberFlowCalls).toHaveLength(0)

    rerender(<Nav balance={1300} isAdmin={false} />)
    await waitFor(() => expect(numberFlowCalls.length).toBeGreaterThanOrEqual(2))
    expect(numberFlowCalls[0].value).toBe(1250)
    await waitFor(() => expect(numberFlowCalls.at(-1)?.value).toBe(1300))
    for (const call of numberFlowCalls) {
      expect(call.locales).toBe('en-US')
      expect(call.format?.useGrouping).not.toBe(false)
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
    for (const button of screen.getAllByRole('button', { name: /^Your profile and settings/ })) expect(button).toHaveClass('pressable')
  })

  it('offers a skip-to-content link as the first link on the page', () => {
    render(<Nav balance={120} isAdmin={false} />)
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAccessibleName('Skip to content')
    expect(links[0]).toHaveAttribute('href', '#main')
  })


  // #385 (A11Y-12): the beta sticker stays on sign-in, not in the signed-in shell.
  it('shows no Beta badge in the signed-in shell', () => {
    render(<Nav balance={120} isAdmin={false} />)
    expect(screen.getAllByRole('link', { name: 'DwellDuel home' })).toHaveLength(2)
    expect(screen.queryByText('Beta')).toBeNull()
  })

  it('shows the balance as text, with no coin icon', () => {
    render(<Nav balance={4886} isAdmin={false} />)
    for (const chip of screen.getAllByRole('link', { name: /^Balance/ })) {
      expect(chip).toHaveTextContent('4,886 DC')
      expect(chip.querySelector('svg')).toBeNull()
    }
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

  it('dots the avatar when work waits on a reviewer, with the count in its name', () => {
    render(<Nav balance={120} isAdmin attention={3} />)
    const buttons = screen.getAllByRole('button', { name: 'Your profile and settings, 3 waiting' })
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      const dot = button.querySelector('.bg-loss')
      expect(dot).toHaveAttribute('aria-hidden', 'true')
      expect(dot).toHaveClass('ring-surface')
    }
  })

  it('says how much waits on the Admin item', async () => {
    render(<Nav balance={120} isAdmin attention={14} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Your profile and settings, 14 waiting' })[0])
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /Admin/ })).toHaveTextContent('14 waiting')
  })

  it('shows no dot when nothing is waiting, or to a member', () => {
    const { unmount } = render(<Nav balance={120} isAdmin attention={0} />)
    for (const button of screen.getAllByRole('button', { name: 'Your profile and settings' })) expect(button.querySelector('.bg-loss')).toBeNull()
    unmount()
    render(<Nav balance={120} isAdmin={false} attention={3} />)
    for (const button of screen.getAllByRole('button', { name: 'Your profile and settings' })) expect(button.querySelector('.bg-loss')).toBeNull()
  })
})
