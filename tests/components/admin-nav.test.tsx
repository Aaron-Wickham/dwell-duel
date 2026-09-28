// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

let pathname = '/admin/invites'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

import { AdminNav } from '@/components/admin/admin-nav'

const SECTIONS = [
  ['Invites', '/admin/invites'],
  ['Tasks', '/admin/tasks'],
  ['Members', '/admin/members'],
  ['Ledger', '/admin/ledger'],
]

describe('AdminNav', () => {
  it('links every admin section, in order', () => {
    render(<AdminNav role="admin" />)
    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual(SECTIONS)
  })

  it('shows no switcher to a reviewer, whose only section is the approval queue', () => {
    render(<AdminNav role="reviewer" />)
    expect(screen.queryByRole('navigation', { name: 'Admin sections' })).not.toBeInTheDocument()
  })

  it('behaves like a native segmented control: no long-press menu, a press state on each tab', () => {
    render(<AdminNav role="admin" />)
    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    expect(nav).toHaveClass('no-callout')
    for (const link of within(nav).getAllByRole('link')) expect(link).toHaveClass('pressable')
  })

  it.each(SECTIONS)('marks only %s as the current page at %s', (label, href) => {
    pathname = href
    render(<AdminNav role="admin" />)
    for (const link of screen.getAllByRole('link')) {
      if (link.textContent === label) expect(link).toHaveAttribute('aria-current', 'page')
      else expect(link).not.toHaveAttribute('aria-current')
    }
  })
})
