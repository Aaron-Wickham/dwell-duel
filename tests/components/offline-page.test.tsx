// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import OfflinePage from '@/app/(auth)/offline/page'

describe('OfflinePage', () => {
  it('explains the page needs a connection', () => {
    render(<OfflinePage />)
    expect(screen.getByRole('heading', { level: 1, name: 'You’re offline' })).toBeInTheDocument()
    expect(screen.getByText('This page loads by itself as soon as you’re back online.')).toBeInTheDocument()
  })

  it('puts its content in the main landmark', () => {
    render(<OfflinePage />)
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { level: 1 }))
  })

  it('offers "Try again" as a plain link that reloads the URL being opened', () => {
    render(<OfflinePage />)
    // Testing Library doesn't give an empty-href anchor the link role, though browsers do.
    const retry = screen.getByText('Try again')
    expect(retry.tagName).toBe('A')
    expect(retry).toHaveAttribute('href', '')
    expect(retry).toHaveClass('no-underline')
  })

  it('reloads by itself when the connection comes back (ST-12)', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(<OfflinePage />)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(reload).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('Trying again…')
    vi.unstubAllGlobals()
  })
})
