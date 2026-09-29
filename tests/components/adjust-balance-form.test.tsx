// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdjustBalanceForm } from '@/app/(app)/admin/members/adjust-balance-form'
import type { MemberSummary } from '@/lib/members/list-members'

const member: MemberSummary = {
  id: 'member-1',
  displayName: 'Bob',
  avatarSrc: null,
  email: 'bob@example.com',
  balance: 90,
  role: 'member',
  joinedAt: '2026-09-01T12:00:00Z',
  lastSignInAt: null,
}

const NOW = Date.parse('2026-09-28T12:00:00Z')

describe('AdjustBalanceForm', () => {
  it('links the member name to their profile, the whole identity block its tap target', () => {
    render(<AdjustBalanceForm member={member} now={NOW} />)
    const link = screen.getByRole('link', { name: 'Bob' })
    expect(link).toHaveAttribute('href', '/members/member-1')
    expect(link).toHaveClass('stretched-link')
    expect(link.parentElement!.closest('.pressable')).toHaveClass('relative')
  })

  it('keeps the name bold and shows the balance beside it', () => {
    render(<AdjustBalanceForm member={member} now={NOW} />)
    expect(screen.getByRole('link', { name: 'Bob' })).toHaveClass('font-extrabold')
    expect(screen.getByText('90 DC')).toBeInTheDocument()
  })
})
