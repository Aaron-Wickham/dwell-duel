// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import NotInvitedPage from '@/app/(auth)/not-invited/page'

describe('NotInvitedPage', () => {
  it('explains the invite-only rule and offers a way back to sign-in', () => {
    render(<NotInvitedPage />)
    expect(screen.getByRole('heading', { name: 'Not invited' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try another account' })).toHaveAttribute('href', '/sign-in')
  })

  it('puts its content in the main landmark', () => {
    render(<NotInvitedPage />)
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { level: 1 }))
  })
})
