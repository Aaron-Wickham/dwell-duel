// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/supabase/client', () => ({ browserClient: () => ({ auth: { signInWithOAuth: vi.fn() } }) }))

import SignInPage from '@/app/(auth)/sign-in/page'

describe('SignInPage', () => {
  it('shows the tagline and the Google sign-in button', () => {
    render(<SignInPage />)
    expect(screen.getByRole('heading', { name: /Friendly bets/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
  })

  it('shows the Beta badge under the symbol', () => {
    render(<SignInPage />)
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })
})
