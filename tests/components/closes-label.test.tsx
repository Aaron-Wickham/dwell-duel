// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { ClosesLabel } from '@/components/markets/closes-label'

const NOW = Date.parse('2026-09-25T12:00:00Z')

afterEach(() => {
  vi.useRealTimers()
})

describe('ClosesLabel', () => {
  it('shows how long is left for a market closing within a day', () => {
    vi.useFakeTimers({ now: NOW })
    render(<ClosesLabel closeAt="2026-09-25T14:20:00Z" now={NOW} />)
    expect(screen.getByText('Closes in 2h')).toBeInTheDocument()
  })

  it('dates a market closing more than a day away', () => {
    vi.useFakeTimers({ now: NOW })
    const { container } = render(<ClosesLabel closeAt="2026-09-27T12:00:00Z" now={NOW} />)
    expect(container.textContent).toMatch(/^Closes /)
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-09-27T12:00:00Z')
  })

  it('keeps counting down while the page stays open, then says it is waiting for a result', () => {
    vi.useFakeTimers({ now: NOW })
    const { container } = render(<ClosesLabel closeAt="2026-09-25T12:02:00Z" now={NOW} />)
    expect(screen.getByText('Closes in 2m')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByText('Closes in 1m')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(60_000))
    expect(container.textContent).toBe('Waiting for a result')
  })

  it('switches to the countdown when a market crosses into its last day', () => {
    vi.useFakeTimers({ now: NOW })
    render(<ClosesLabel closeAt="2026-09-26T12:00:30Z" now={NOW} />)
    expect(screen.queryByText(/Closes in/)).toBeNull()

    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByText('Closes in 24h')).toBeInTheDocument()
  })
})
