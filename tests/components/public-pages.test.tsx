// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/app/(auth)/sign-in/sign-in-button', () => ({
  SignInButton: ({ direct }: { direct?: boolean }) => <button type="button">{direct ? 'Direct' : 'Supabase'} sign-in</button>,
}))

import SignInPage from '@/app/(auth)/sign-in/page'
import PrivacyPage from '@/app/(auth)/privacy/page'
import { howItWorks } from '@/lib/docs/how-it-works'
import { inlineText } from '@/lib/docs/markdown'

afterEach(() => vi.unstubAllEnvs())

describe('the sign-in page', () => {
  it('says what DwellDuel is, and links to the privacy page', () => {
    render(<SignInPage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Friendly bets. Faithful study.')
    expect(screen.getByText(/Play money, invite-only\.$/)).toBeInTheDocument()
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

  it('points links to other sections at How it works', () => {
    render(<PrivacyPage />)
    expect(screen.getAllByRole('link', { name: 'Roles' }).every((a) => a.getAttribute('href') === '/how-it-works/rules#how-roles')).toBe(true)
  })
})
