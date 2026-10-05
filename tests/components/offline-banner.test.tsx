// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { useOffline } = vi.hoisted(() => ({ useOffline: vi.fn() }))
vi.mock('next/offline', () => ({ useOffline }))

import { OfflineBanner } from '@/components/offline/offline-banner'

const COPY = 'Offline. Reconnecting…'

beforeEach(() => {
  useOffline.mockReset()
})

describe('OfflineBanner', () => {
  it('keeps an empty live region while online', () => {
    useOffline.mockReturnValue(false)
    render(<OfflineBanner />)
    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()
    expect(screen.queryByText(COPY)).toBeNull()
  })

  it('shows the offline copy inside the live region while offline', () => {
    useOffline.mockReturnValue(true)
    render(<OfflineBanner />)
    expect(screen.getByRole('status')).toHaveTextContent(COPY)
  })

  it('overlays just below the phone and desktop top bars, out of flow so it moves nothing (ST-7)', () => {
    useOffline.mockReturnValue(true)
    render(<OfflineBanner />)
    expect(screen.getByRole('status')).toHaveClass(
      'fixed',
      'inset-x-0',
      'top-[calc(4rem+var(--safe-top))]',
      'md:top-[calc(72px+var(--safe-top))]',
    )
  })

  it('announces going offline and clears when the connection returns', () => {
    useOffline.mockReturnValue(false)
    const { rerender } = render(<OfflineBanner />)
    const region = screen.getByRole('status')

    useOffline.mockReturnValue(true)
    rerender(<OfflineBanner />)
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent(COPY)

    useOffline.mockReturnValue(false)
    rerender(<OfflineBanner />)
    expect(region).toBeEmptyDOMElement()
  })
})
