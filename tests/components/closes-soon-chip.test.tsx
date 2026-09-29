// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { ClosesSoonChip } from '@/components/markets/closes-soon-chip'

const NOW = Date.parse('2026-09-25T12:00:00Z')

afterEach(() => {
  vi.useRealTimers()
})

describe('ClosesSoonChip', () => {
  it('shows how long is left for a market closing within a day', () => {
    vi.useFakeTimers({ now: NOW })
    render(<ClosesSoonChip closeAt="2026-09-25T14:30:00Z" now={NOW} />)
    expect(screen.getByText('Closes in 2h')).toBeInTheDocument()
  })

  it('renders nothing for a market closing more than a day away', () => {
    vi.useFakeTimers({ now: NOW })
    const { container } = render(<ClosesSoonChip closeAt="2026-09-27T12:00:00Z" now={NOW} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps counting down while the page stays open, and goes once the market closes', () => {
    vi.useFakeTimers({ now: NOW })
    const { container } = render(<ClosesSoonChip closeAt="2026-09-25T12:02:00Z" now={NOW} />)
    expect(screen.getByText('Closes in 2m')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByText('Closes in 1m')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(60_000))
    expect(container).toBeEmptyDOMElement()
  })

  it('comes into view when a market crosses into its last day', () => {
    vi.useFakeTimers({ now: NOW })
    render(<ClosesSoonChip closeAt="2026-09-26T12:00:30Z" now={NOW} />)
    expect(screen.queryByText(/Closes in/)).toBeNull()

    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByText('Closes in 23h')).toBeInTheDocument()
  })
})
