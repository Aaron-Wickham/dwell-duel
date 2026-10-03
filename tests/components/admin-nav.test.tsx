// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

let pathname = '/admin/invites'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

import { AdminNav } from '@/components/admin/admin-nav'

const SECTIONS = [
  ['Invites', '/admin/invites'],
  ['Tasks', '/admin/tasks'],
  ['Markets', '/admin/markets'],
  ['Members', '/admin/members'],
  ['Ledger', '/admin/ledger'],
]

const NONE = { tasks: 0, markets: 0 }

describe('AdminNav', () => {
  it('links every admin section, in order', () => {
    render(<AdminNav role="admin" counts={NONE} />)
    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual(SECTIONS)
  })

  it('shows no switcher to a reviewer, whose only section is the approval queue', () => {
    render(<AdminNav role="reviewer" counts={NONE} />)
    expect(screen.queryByRole('navigation', { name: 'Admin sections' })).not.toBeInTheDocument()
  })

  it('behaves like a native segmented control: no long-press menu, a press state on each tab', () => {
    render(<AdminNav role="admin" counts={NONE} />)
    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    expect(nav).toHaveClass('no-callout')
    for (const link of within(nav).getAllByRole('link')) expect(link).toHaveClass('pressable')
  })

  it.each(SECTIONS)('marks only %s as the current page at %s', (label, href) => {
    pathname = href
    render(<AdminNav role="admin" counts={NONE} />)
    for (const link of screen.getAllByRole('link')) {
      if (link.textContent === label) expect(link).toHaveAttribute('aria-current', 'page')
      else expect(link).not.toHaveAttribute('aria-current')
    }
  })

  it('badges what waits on each tab, matching the Admin badge, and keeps the labels plain (#243, #351)', () => {
    pathname = '/admin/invites'
    render(<AdminNav role="admin" counts={{ tasks: 1, markets: 12 }} />)
    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    const tab = (name: string) => within(nav).getByRole('link', { name })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Invites',
      'Tasks1',
      'Markets9+',
      'Members',
      'Ledger',
    ])
    expect(tab('Tasks')).toHaveAccessibleDescription('1 waiting')
    expect(tab('Markets')).toHaveAccessibleDescription('12 waiting')
    expect(tab('Invites')).not.toHaveAttribute('aria-describedby')
  })

  it('shows no badge on a tab with nothing waiting', () => {
    render(<AdminNav role="admin" counts={NONE} />)
    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    expect(within(nav).getByRole('link', { name: 'Tasks' })).not.toHaveAttribute('aria-describedby')
    expect(nav.querySelector('[aria-hidden="true"].bg-loss')).toBeNull()
  })
})
