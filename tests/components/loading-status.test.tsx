// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import { LoadingStatus } from '@/components/ui/loading-status'
import { MarketActionsSkeleton, MarketBetsSkeleton, MarketChartSkeleton } from '@/components/markets/market-detail-skeletons'

describe('LoadingStatus', () => {
  it('announces from its first render, then clears once it sees nothing on the page is pending', async () => {
    const { container } = render(<LoadingStatus />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(''))
    expect(renderToString(<LoadingStatus />)).toContain('Loading…')
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
  })

  it('is the market page cold render’s only status, for as long as any of its four fallbacks is showing, and clears once none are', async () => {
    const { rerender } = render(
      <>
        <LoadingStatus />
        <MarketChartSkeleton />
        <MarketActionsSkeleton outcomes={2} />
        <MarketBetsSkeleton />
      </>,
    )

    // Cold render: all four sections pending at once, but exactly one status announces it.
    expect(screen.getAllByRole('status')).toHaveLength(1)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Loading…'))

    // One section resolving (its fallback unmounts) while the others are still pending.
    rerender(
      <>
        <LoadingStatus />
        <MarketActionsSkeleton outcomes={2} />
        <MarketBetsSkeleton />
      </>,
    )
    expect(screen.getAllByRole('status')).toHaveLength(1)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Loading…'))

    // Every section resolved: the status clears instead of announcing "Loading…" forever.
    rerender(<LoadingStatus />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(''))
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })
})
