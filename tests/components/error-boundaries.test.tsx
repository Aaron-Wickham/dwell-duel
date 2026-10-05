// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AppSegmentError from '@/app/(app)/error'
import RootSegmentError from '@/app/error'
import GlobalError from '@/app/global-error'

// next/font/google is rewritten by Next's own SWC/webpack build; plain Vitest never applies that
// transform, so the real module (an empty shim outside a Next build) is mocked here, per the
// Next.js Jest testing docs' `nextFontMock` pattern.
vi.mock('next/font/google', () => ({
  Manrope: () => ({ variable: 'mock-font-manrope' }),
}))

const { reloadOnceForStaleChunk } = vi.hoisted(() => ({ reloadOnceForStaleChunk: vi.fn() }))
vi.mock('@/lib/offline/stale-chunk', () => ({ reloadOnceForStaleChunk }))

function testError(): Error & { digest?: string } {
  const error = new Error('boom') as Error & { digest?: string }
  error.digest = 'digest-123'
  return error
}

describe.each([
  ['app/(app)/error.tsx', AppSegmentError],
  ['app/error.tsx', RootSegmentError],
])('%s', (_name, Boundary) => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('renders the error card and logs the error with its digest', () => {
    const retry = vi.fn()
    const error = testError()
    render(<Boundary error={error} retry={retry} />)

    expect(screen.getByRole('heading', { level: 1, name: 'This page didn’t load' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/')
    expect(consoleError).toHaveBeenCalledWith(error, { digest: 'digest-123' })
  })
})

describe('app/(app)/error.tsx', () => {
  // #209: a tab that outlived a deploy asks for chunks the new build no longer serves.
  it('offers the stale-chunk reload every error it renders, which decides for itself', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = testError()
    render(<AppSegmentError error={error} retry={vi.fn()} />)
    expect(reloadOnceForStaleChunk).toHaveBeenCalledWith(error)
    vi.restoreAllMocks()
  })
})

describe('app/global-error.tsx', () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('renders its own html/body, a title, the error card, and logs the error with its digest', () => {
    const retry = vi.fn()
    const error = testError()
    render(<GlobalError error={error} retry={retry} />)

    expect(document.title).toBe('This page didn’t load')
    expect(screen.getByRole('heading', { level: 1, name: 'This page didn’t load' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith(error, { digest: 'digest-123' })
    // React 19 hoists the boundary's <html> attributes onto the real document element rather
    // than nesting a literal <html> node in the render container.
    expect(document.documentElement).toHaveClass('h-full')
  })
})
