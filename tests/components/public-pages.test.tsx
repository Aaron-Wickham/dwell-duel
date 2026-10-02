// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/app/(auth)/sign-in/google-sign-in', () => ({
  GoogleSignIn: ({ clientId }: { clientId: string }) => <p>Google’s button for {clientId}</p>,
}))

import SignInPage from '@/app/(auth)/sign-in/page'
import PrivacyPage from '@/app/(auth)/privacy/page'
import { howItWorks } from '@/lib/docs/how-it-works'
import { inlineText } from '@/lib/docs/markdown'

afterEach(() => vi.unstubAllEnvs())

describe('the sign-in page', () => {
  it('says what DwellDuel is, and links to the privacy page', () => {
    render(<SignInPage />)
    expect(screen.getByText(/^Bet play-money Dwell Coin on questions from your church friends/)).toHaveTextContent(
      'Bet play-money Dwell Coin on questions from your church friends, and earn more by studying the Bible.',
    )
    expect(screen.getByText('Play money, invite-only')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
  })

  it('uses Supabase’s Google redirect without a Google client ID', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '')
    render(<SignInPage />)
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
    expect(screen.queryByText(/Google’s button/)).toBeNull()
  })

  it('shows Google’s own button with one', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'client.apps.googleusercontent.com')
    render(<SignInPage />)
    expect(screen.getByText('Google’s button for client.apps.googleusercontent.com')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull()
  })
})

describe('the privacy page', () => {
  it('is How it works’ Your data section, under one h1', () => {
    render(<PrivacyPage />)
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Privacy'])
    const section = howItWorks.sections.find((s) => s.slug === 'your-data')!
    const firstParagraph = section.blocks.find((b) => b.type === 'paragraph')!
    expect(screen.getByText(inlineText(firstParagraph.type === 'paragraph' ? firstParagraph.children : []).slice(0, 40), { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/Who runs it:/)).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Only you')).toBeInTheDocument()
  })

  it('points links to other sections at How it works', () => {
    render(<PrivacyPage />)
    expect(screen.getAllByRole('link', { name: 'Roles' }).every((a) => a.getAttribute('href') === '/how-it-works#how-roles')).toBe(true)
  })
})
