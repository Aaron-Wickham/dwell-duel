// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

let params = new URLSearchParams()
vi.mock('next/navigation', () => ({ useSearchParams: () => params }))

const signInWithOAuth = vi.fn(async () => ({ data: { url: null, provider: 'google' }, error: null }))
vi.mock('@/lib/supabase/client', () => ({ browserClient: () => ({ auth: { signInWithOAuth } }) }))

import { SignInButton } from '@/app/(auth)/sign-in/sign-in-button'

beforeEach(() => {
  params = new URLSearchParams()
  signInWithOAuth.mockClear()
})

describe('SignInButton', () => {
  it('starts the same Google OAuth flow as before the restyle', async () => {
    render(<SignInButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/callback`, queryParams: { prompt: 'select_account' } },
    })
  })

  it('remembers a safe next path for the callback, and forgets an unsafe one (#263)', async () => {
    const cookies: string[] = []
    vi.spyOn(document, 'cookie', 'set').mockImplementation((value: string) => void cookies.push(value))

    params = new URLSearchParams('next=/markets/abc')
    const { unmount } = render(<SignInButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(cookies.at(-1)).toMatch(/^sign-in-next=%2Fmarkets%2Fabc; Path=\/callback; Max-Age=600; SameSite=Lax/)
    unmount()

    params = new URLSearchParams('next=//evil.example')
    render(<SignInButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(cookies.at(-1)).toMatch(/^sign-in-next=; Path=\/callback; Max-Age=0/)
    vi.restoreAllMocks()
  })

  it('says it is opening Google while the redirect loads, and ignores a second tap', async () => {
    signInWithOAuth.mockImplementationOnce(() => new Promise(() => {}))
    render(<SignInButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(screen.getByRole('status')).toHaveTextContent('Opening Google…')
    await userEvent.click(screen.getByRole('button', { name: 'Opening Google…' }))
    expect(signInWithOAuth).toHaveBeenCalledOnce()
  })

  it('goes back to the button and says so if the redirect could not start (#221)', async () => {
    signInWithOAuth.mockResolvedValueOnce({ data: { url: null, provider: 'google' }, error: new Error('nope') } as never)
    render(<SignInButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t open Google sign-in. Check your connection and try again.')
  })

  it('says so when the sign-in call itself throws, and clears the message on the next tap', async () => {
    signInWithOAuth.mockRejectedValueOnce(new Error('Failed to fetch')).mockImplementationOnce(() => new Promise(() => {}))
    render(<SignInButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t open Google sign-in.')

    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Opening Google…')
  })

  it('goes straight to Google’s URL from /auth/google/nonce when direct, carrying next', async () => {
    const assign = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign })
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' }))
    params = new URLSearchParams('next=/markets/abc')
    render(<SignInButton direct />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(fetch).toHaveBeenCalledWith('/auth/google/nonce', expect.objectContaining({ method: 'POST', body: JSON.stringify({ next: '/markets/abc' }) }))
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1')
    expect(signInWithOAuth).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('says so when direct sign-in can’t start', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }))
    render(<SignInButton direct />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t open Google sign-in.')
    vi.restoreAllMocks()
  })

  it('offers Supabase’s redirect beside a direct button after a failed sign-in, and only then', async () => {
    const { unmount } = render(<SignInButton direct />)
    expect(screen.queryByRole('button', { name: 'Try another way' })).toBeNull()
    unmount()

    params = new URLSearchParams('error=auth')
    render(<SignInButton direct />)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Try another way' }))
    expect(signInWithOAuth).toHaveBeenCalledOnce()
  })

  it('shows the friendly error after a failed redirect back', () => {
    params = new URLSearchParams('error=auth')
    render(<SignInButton />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong signing you in. Try again.')
  })
})
