// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined) }),
}))
const clearNotInvitedEmailAction = vi.fn(async () => {})
vi.mock('@/lib/auth/clear-not-invited-email', () => ({ clearNotInvitedEmailAction: () => clearNotInvitedEmailAction() }))

import NotInvitedPage from '@/app/(auth)/not-invited/page'

async function renderPage(search: Record<string, string> = {}) {
  render(await NotInvitedPage({ params: Promise.resolve({}), searchParams: Promise.resolve(search) } as never))
}

beforeEach(() => {
  jar = new Map()
  clearNotInvitedEmailAction.mockClear()
})

describe('NotInvitedPage', () => {
  it('explains the invite-only rule and offers a way back to sign-in', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Not invited' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try another account' })).toHaveAttribute('href', '/sign-in')
    expect(screen.queryByText(/You signed in as/)).toBeNull()
    expect(clearNotInvitedEmailAction).not.toHaveBeenCalled()
  })

  it('names the refused account from the callback’s cookie, then clears it (#263)', async () => {
    jar.set('not-invited-email', 'wrong@example.com')
    await renderPage()
    expect(screen.getByText(/You signed in as/)).toHaveTextContent('You signed in as wrong@example.com.')
    expect(clearNotInvitedEmailAction).toHaveBeenCalledOnce()
  })

  it('keeps a safe destination for the next try', async () => {
    await renderPage({ next: '/markets/abc' })
    expect(screen.getByRole('link', { name: 'Try another account' })).toHaveAttribute('href', '/sign-in?next=%2Fmarkets%2Fabc')
  })

  it('drops a destination that would leave the site', async () => {
    await renderPage({ next: '//evil.example' })
    expect(screen.getByRole('link', { name: 'Try another account' })).toHaveAttribute('href', '/sign-in')
  })

  it('puts its content in the main landmark', async () => {
    await renderPage()
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { level: 1 }))
  })
})
