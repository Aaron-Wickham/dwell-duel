// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { MemberSummary } from '@/lib/members/list-members'
import { MemberRow, MembersTableHead } from '@/app/(app)/admin/members/member-row'

const BEN: MemberSummary = {
  id: 'p-ben',
  displayName: 'Ben',
  avatarSrc: null,
  email: 'ben@example.com',
  balance: 4886,
  role: 'reviewer',
  joinedAt: '2026-09-01T12:00:00Z',
  lastSignInAt: null,
  removed: false,
}

function renderRow(member: MemberSummary = BEN, netWorth: number | null = 5161) {
  render(
    <table>
      <MembersTableHead />
      <tbody>
        <MemberRow member={member} domId="member-p-ben" netWorth={netWorth ?? undefined} />
      </tbody>
    </table>,
  )
  return screen.getByRole('row', { name: 'Ben' })
}

// #254 and #399: a read-only row of a table; the forms are on the member's own Admin page.
describe('MemberRow', () => {
  it('sits under Member, Role, Balance, Net worth and Joined, with the figures right-aligned', () => {
    renderRow()
    const headers = screen.getAllByRole('columnheader')
    expect(headers.map((h) => h.textContent)).toEqual(['Member', 'Role', 'Balance', 'Net worth', 'Joined'])
    expect(headers[2]).toHaveClass('text-right')
    expect(headers[3]).toHaveClass('text-right')
  })

  it('links the name to the member’s Admin page, with no forms or buttons', () => {
    const row = renderRow()
    expect(within(row).getByRole('link', { name: 'Ben' })).toHaveAttribute('href', '/admin/members/p-ben')
    expect(within(row).queryByRole('button')).toBeNull()
    expect(within(row).queryByRole('textbox')).toBeNull()
  })

  it('shows the email, role, balance, net worth and when they joined', () => {
    const row = renderRow()
    const cells = within(row).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('Benben@example.com')
    expect(within(row).getByText('ben@example.com')).toHaveClass('wrap-anywhere')
    expect(cells[1]).toHaveTextContent('Reviewer')
    expect(cells[2]).toHaveTextContent('4,886 DC balance')
    expect(cells[2]).toHaveClass('lg:text-right', 'lg:tabular-nums')
    expect(cells[3]).toHaveTextContent('5,161 DC net worth')
    expect(cells[4]).toHaveTextContent(/Joined Sep \d+/)
  })

  it('is a "Show more" focus target named by the member’s name', () => {
    const row = renderRow()
    expect(row).toHaveAttribute('id', 'member-p-ben')
    expect(row).toHaveAttribute('tabindex', '-1')
  })

  // #265
  it('marks a removed member Removed in place of their role', () => {
    const row = renderRow({ ...BEN, removed: true, role: 'member' })
    expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('Removed')
  })

  it('shows a dash for a net worth it couldn’t read', () => {
    const row = renderRow(BEN, null)
    expect(within(row).getAllByRole('cell')[3]).toHaveTextContent('— net worth')
  })
})
