// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { MemberSummary } from '@/lib/members/list-members'

const { adjustBalanceAction } = vi.hoisted(() => ({ adjustBalanceAction: vi.fn() }))
vi.mock('@/lib/members/adjust-balance', () => ({ adjustBalanceAction }))

import { AdjustBalanceForm } from '@/app/(app)/admin/members/adjust-balance-form'

const member: MemberSummary = {
  id: 'm1',
  displayName: 'Grace',
  email: 'grace@example.com',
  balance: 40,
  isAdmin: false,
}

describe('AdjustBalanceForm', () => {
  it('spaces the member block from the fields at 12px on phone and 16px on desktop, keeping 8px before the button', () => {
    render(<AdjustBalanceForm member={member} />)

    const form = screen.getByRole('link', { name: 'Grace' }).closest('form')
    expect(form).toHaveClass('gap-3', 'md:gap-4')
    expect(form).not.toHaveClass('gap-2')

    const button = screen.getByRole('button', { name: /Adjust/ })
    expect(button.parentElement).toHaveClass('gap-2')
  })
})
