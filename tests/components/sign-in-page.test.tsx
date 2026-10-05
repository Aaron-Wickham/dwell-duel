// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/supabase/client', () => ({ browserClient: () => ({ auth: { signInWithOAuth: vi.fn() } }) }))

import SignInPage from '@/app/(auth)/sign-in/page'

describe('SignInPage', () => {
  it('shows the tagline and the Google sign-in button', () => {
    render(<SignInPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Friendly bets. Faithful study.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
  })

  it('marks the app as a beta beside the wordmark, as the signed-in header does (#354)', () => {
    render(<SignInPage />)
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('tells an invitee which account to use', () => {
    render(<SignInPage />)
    expect(screen.getByText('Use the Google account your invite was sent to.')).toBeInTheDocument()
  })

  // #387: one plain sentence, where three facts sat in icon tiles.
  it('says what DwellDuel is in one sentence', () => {
    render(<SignInPage />)
    expect(screen.getByText('Bet on friendly questions and earn DC with Bible-study tasks. Play money, invite-only.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'What DwellDuel is' })).toBeNull()
  })

  it('shows a sample market, labelled as a sample, at its final odds', () => {
    render(<SignInPage />)
    const sample = screen.getByRole('img', { name: /^Sample market: Will the sermon run past noon\?/ })
    expect(sample).toHaveAccessibleName('Sample market: Will the sermon run past noon? Yes 61%, No 39%.')
  })

  it('has one h1, inside the main landmark', () => {
    render(<SignInPage />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { level: 1 }))
  })
})
