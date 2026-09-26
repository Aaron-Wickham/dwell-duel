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
      options: { redirectTo: `${window.location.origin}/callback` },
    })
  })

  it('shows the friendly error after a failed redirect back', () => {
    params = new URLSearchParams('error=auth')
    render(<SignInButton />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong signing you in. Try again.')
  })
})
