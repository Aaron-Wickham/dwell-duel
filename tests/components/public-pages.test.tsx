// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/app/(auth)/sign-in/sign-in-button', () => ({
  SignInButton: ({ direct }: { direct?: boolean }) => <button type="button">{direct ? 'Direct' : 'Supabase'} sign-in</button>,
}))

import SignInPage from '@/app/(auth)/sign-in/page'
import PrivacyPage from '@/app/(auth)/privacy/page'
import TermsPage from '@/app/(auth)/terms/page'
import { howItWorks } from '@/lib/docs/how-it-works'
import { inlineText } from '@/lib/docs/markdown'

afterEach(() => vi.unstubAllEnvs())

describe('the sign-in page', () => {
  // PUB-1: a short phone keeps the answer to "is this real money?" as one line.
  it('keeps a short no-real-money line for short phones', () => {
    render(<SignInPage />)
    expect(screen.getByText('Play money only. No real money.')).toHaveClass('hidden', 'short:block')
    expect(screen.getByText(/^Bet play money/)).toHaveClass('short:hidden')
  })

  it('says what DwellDuel is, and links to the privacy page', () => {
    render(<SignInPage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Friendly bets with your church friends')
    expect(screen.getByText(/Bible study\. No real money\.$/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
  })

  it('uses Supabase’s Google redirect without a Google client ID', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '')
    render(<SignInPage />)
    expect(screen.getByRole('button', { name: 'Supabase sign-in' })).toBeInTheDocument()
  })

  it('goes straight to Google with one', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'client.apps.googleusercontent.com')
    render(<SignInPage />)
    expect(screen.getByRole('button', { name: 'Direct sign-in' })).toBeInTheDocument()
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

  // PUB-4: the rest of the rules is signed-in, so a signed-out reader gets the words, not a link.
  it('names other sections as plain words, not links into the signed-in rules', () => {
    render(<PrivacyPage />)
    expect(screen.queryByRole('link', { name: 'Roles' })).toBeNull()
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href')?.startsWith('/how-it-works'))).toBe(false)
    expect(screen.getByText(/see Roles\)/)).toBeInTheDocument()
  })

  it('leads back to DwellDuel', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('link', { name: 'Go to DwellDuel' })).toHaveAttribute('href', '/')
  })
})

describe('the terms page', () => {
  it('leads back to DwellDuel', () => {
    render(<TermsPage />)
    expect(screen.getByRole('link', { name: 'Go to DwellDuel' })).toHaveAttribute('href', '/')
  })
})
