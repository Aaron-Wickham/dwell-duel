// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdjustBalanceForm } from '@/app/(app)/admin/members/adjust-balance-form'
import type { MemberSummary } from '@/lib/members/list-members'

const member: MemberSummary = {
  id: 'member-1',
  displayName: 'Bob',
  email: 'bob@example.com',
  balance: 90,
  isAdmin: false,
}

describe('AdjustBalanceForm', () => {
  it('links the member name to their profile with a 44px tap target', () => {
    render(<AdjustBalanceForm member={member} />)
    const link = screen.getByRole('link', { name: 'Bob' })
    expect(link).toHaveAttribute('href', '/members/member-1')
    expect(link).toHaveClass('min-h-11')
  })

  it('keeps the name bold and shows the balance beside it', () => {
    render(<AdjustBalanceForm member={member} />)
    expect(screen.getByRole('link', { name: 'Bob' })).toHaveClass('font-extrabold')
    expect(screen.getByText('90 DC')).toBeInTheDocument()
  })
})
