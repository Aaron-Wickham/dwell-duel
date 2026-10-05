// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { MemberSummary } from '@/lib/members/list-members'
import { MemberRow } from '@/app/(app)/admin/members/member-row'
import { rowTitleClass } from '@/components/ui/page'

const NOW = Date.parse('2026-09-28T12:00:00Z')
const BEN: MemberSummary = {
  id: 'p-ben',
  displayName: 'Ben',
  avatarSrc: null,
  email: 'ben@example.com',
  balance: 60,
  role: 'reviewer',
  joinedAt: '2026-09-01T12:00:00Z',
  lastSignInAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
  removed: false,
}

function renderRow(member: MemberSummary = BEN) {
  render(
    <ul>
      <MemberRow member={member} domId="member-p-ben" now={NOW} />
    </ul>,
  )
  return screen.getByRole('listitem')
}

// #254: a compact, read-only row; the forms are on the member's own Admin page.
describe('MemberRow', () => {
  it('opens the member’s Admin page from the whole row', () => {
    const row = renderRow()
    const link = within(row).getByRole('link', { name: 'Ben' })
    expect(link).toHaveAttribute('href', '/admin/members/p-ben')
    expect(link).toHaveClass('stretched-link', 'no-underline', ...rowTitleClass.split(' '))
    // A list card on the page (D2): it tints flush and never lifts, at every width.
    expect(row).toHaveClass('relative', 'pressable', 'hover-tint')
    expect(row).not.toHaveClass('lg:hover-lift')
    expect(within(row).queryByRole('button')).toBeNull()
    expect(within(row).queryByRole('textbox')).toBeNull()
  })

  it('shows the role, email, balance and last sign-in', () => {
    const row = renderRow()
    expect(within(row).getByText('Reviewer')).toBeInTheDocument()
    expect(within(row).getByText('ben@example.com')).toHaveClass('wrap-anywhere')
    expect(within(row).getByText('60 DC')).toBeInTheDocument()
    expect(row).toHaveTextContent('60 DC · Active 2h ago')
    expect(row).not.toHaveTextContent('Joined')
  })

  it('is a "Show more" focus target named by the member’s name', () => {
    const row = renderRow()
    expect(row).toHaveAttribute('id', 'member-p-ben')
    expect(row).toHaveAttribute('tabindex', '-1')
    expect(row).toHaveAccessibleName('Ben')
  })

  // #265
  it('marks a removed member Removed in place of their role', () => {
    const row = renderRow({ ...BEN, removed: true, role: 'member' })
    expect(within(row).getByText('Removed')).toBeInTheDocument()
    expect(within(row).queryByText('Reviewer')).toBeNull()
  })
})
