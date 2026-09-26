// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AppSegmentError from '@/app/(app)/error'
import RootSegmentError from '@/app/error'
import GlobalError from '@/app/global-error'

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

    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith(error, { digest: 'digest-123' })
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

    expect(document.title).toBe('Something went wrong')
    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith(error, { digest: 'digest-123' })
  })
})
