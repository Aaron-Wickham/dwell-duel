// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'

let params = new URLSearchParams()
vi.mock('next/navigation', () => ({ useSearchParams: () => params }))
const signInWithOAuth = vi.fn(() => new Promise(() => {}))
vi.mock('@/lib/supabase/client', () => ({ browserClient: () => ({ auth: { signInWithOAuth } }) }))
const reportClientError = vi.fn()
vi.mock('@/lib/observability/client', () => ({ reportClientError: (e: unknown) => reportClientError(e) }))

import { GoogleSignIn } from '@/app/(auth)/sign-in/google-sign-in'

const initialize = vi.fn()
const renderButton = vi.fn((parent: HTMLElement) => {
  const button = document.createElement('button')
  button.textContent = 'Google’s button'
  parent.appendChild(button)
})
const fetchMock = vi.fn()

beforeEach(() => {
  params = new URLSearchParams()
  initialize.mockClear()
  signInWithOAuth.mockClear()
  renderButton.mockClear()
  reportClientError.mockClear()
  window.google = { accounts: { id: { initialize, renderButton } } }
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ nonce: 'hashed-nonce' }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})

afterEach(() => {
  delete window.google
  vi.unstubAllGlobals()
})

describe('GoogleSignIn', () => {
  it('shows Google’s button in redirect mode, posting to /auth/google with the server’s hashed nonce', async () => {
    params = new URLSearchParams('next=/markets/abc')
    render(<GoogleSignIn clientId="client-123.apps.googleusercontent.com" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading Google sign-in…')
    expect(await screen.findByRole('button', { name: 'Google’s button' })).toBeInTheDocument()

    expect(fetchMock).toHaveBeenCalledWith('/auth/google/nonce', expect.objectContaining({ method: 'POST', body: JSON.stringify({ next: '/markets/abc' }) }))
    expect(initialize).toHaveBeenCalledWith({
      client_id: 'client-123.apps.googleusercontent.com',
      ux_mode: 'redirect',
      login_uri: `${window.location.origin}/auth/google`,
      nonce: 'hashed-nonce',
      auto_select: false,
    })
    expect(renderButton).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ type: 'standard', text: 'signin_with' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('matches the theme: Google’s dark button under a dark theme', async () => {
    document.documentElement.dataset.theme = 'dark'
    render(<GoogleSignIn clientId="c" />)
    await screen.findByRole('button', { name: 'Google’s button' })
    expect(renderButton).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ theme: 'filled_black' }))
    delete document.documentElement.dataset.theme
  })

  it('keeps the button’s iframe in a normal colour scheme, so a dark page shows no white box behind it (#354)', async () => {
    document.documentElement.dataset.theme = 'dark'
    render(<GoogleSignIn clientId="c" />)
    await screen.findByRole('button', { name: 'Google’s button' })
    expect(screen.getByTestId('google-sign-in')).toHaveClass('[color-scheme:normal]')
    delete document.documentElement.dataset.theme
  })

  it('never sends an unsafe next to the nonce route', async () => {
    params = new URLSearchParams('next=//evil.example')
    render(<GoogleSignIn clientId="c" />)
    await screen.findByRole('button', { name: 'Google’s button' })
    expect(fetchMock).toHaveBeenCalledWith('/auth/google/nonce', expect.objectContaining({ body: JSON.stringify({ next: null }) }))
  })

  it('falls back to the Supabase sign-in button, and reports it, when the nonce can’t be had', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }))
    render(<GoogleSignIn clientId="c" />)
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
    expect(initialize).not.toHaveBeenCalled()
    await waitFor(() => expect(reportClientError).toHaveBeenCalledOnce())
  })

  it('falls back when Google’s script won’t load', async () => {
    delete window.google
    render(<GoogleSignIn clientId="c" />)
    const script = document.head.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]')
    expect(script).not.toBeNull()
    script!.dispatchEvent(new Event('error'))
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
    // Expected (a blocker, a bad network) and covered by the fallback, so not an error (#363).
    expect(reportClientError).not.toHaveBeenCalled()
  })

  it('falls back without reporting when Google’s script never arrives, but reports a nonce that never does', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      delete window.google
      const { unmount } = render(<GoogleSignIn clientId="c" />)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
      expect(reportClientError).not.toHaveBeenCalled()
      unmount()

      window.google = { accounts: { id: { initialize, renderButton } } }
      fetchMock.mockImplementation(() => new Promise(() => {}))
      render(<GoogleSignIn clientId="c" />)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
      expect(reportClientError).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('after a failed sign-in, offers Supabase’s redirect as well, so a fault on Google’s path can’t lock anyone out', async () => {
    params = new URLSearchParams('error=auth&next=/tasks')
    render(<GoogleSignIn clientId="c" />)
    expect(await screen.findByRole('button', { name: 'Google’s button' })).toBeInTheDocument()
    // One message, not one per button.
    expect(screen.getAllByText('Something went wrong signing you in. Try again.')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Try another way' }))
    await waitFor(() =>
      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/callback`, queryParams: { prompt: 'select_account' } },
      }),
    )
  })

  it('offers no other way until a sign-in has failed', async () => {
    render(<GoogleSignIn clientId="c" />)
    await screen.findByRole('button', { name: 'Google’s button' })
    expect(screen.queryByRole('button', { name: 'Try another way' })).toBeNull()
  })

  it('aborts a superseded nonce request, so only the newest nonce reaches Google (Strict Mode)', async () => {
    const signals: AbortSignal[] = []
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      signals.push(init.signal!)
      return new Response(JSON.stringify({ nonce: `nonce-${signals.length}` }), { status: 200 })
    })
    render(
      <StrictMode>
        <GoogleSignIn clientId="c" />
      </StrictMode>,
    )
    await screen.findByRole('button', { name: 'Google’s button' })
    expect(signals).toHaveLength(2)
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    expect(initialize).toHaveBeenCalledOnce()
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ nonce: 'nonce-2' }))
  })

  it.each([
    ['auth', 'Something went wrong signing you in. Try again.'],
    ['expired', 'That sign-in expired or was started in another tab. Try again.'],
  ])('shows the friendly message for ?error=%s', async (error, message) => {
    params = new URLSearchParams(`error=${error}`)
    render(<GoogleSignIn clientId="c" />)
    expect(screen.getByRole('alert')).toHaveTextContent(message)
  })
})
