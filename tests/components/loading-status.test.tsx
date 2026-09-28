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
  it('announces on the server, before there is a DOM to check', () => {
    expect(renderToString(<LoadingStatus>resolved content</LoadingStatus>)).toContain('Loading…')
    expect(
      renderToString(
        <LoadingStatus>
          <div data-skeleton="x" />
        </LoadingStatus>,
      ),
    ).toContain('Loading…')
  })

  it('a client mount with nothing pending never announces, checked synchronously after render', () => {
    render(<LoadingStatus>resolved content</LoadingStatus>)
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('a client mount with a pending section announces, and clears once it unmounts', async () => {
    const { rerender } = render(
      <LoadingStatus>
        <MarketChartSkeleton />
      </LoadingStatus>,
    )
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Loading…'))

    rerender(<LoadingStatus>{null}</LoadingStatus>)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(''))
  })

  it('ignores a [data-skeleton] element outside the wrapper', async () => {
    render(
      <>
        <div data-skeleton="outside" />
        <LoadingStatus>resolved content</LoadingStatus>
      </>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('')
    // Give a MutationObserver a tick to fire on anything, to prove the outside element never
    // flips this status: there's nothing to observe inside the wrapper in the first place.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('is the market page cold render’s only status, for as long as any of its four fallbacks is showing, and clears once none are', async () => {
    const { rerender } = render(
      <LoadingStatus>
        <MarketChartSkeleton />
        <MarketActionsSkeleton outcomes={2} />
        <MarketBetsSkeleton />
      </LoadingStatus>,
    )

    // Cold render: all four sections pending at once, but exactly one status announces it.
    expect(screen.getAllByRole('status')).toHaveLength(1)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Loading…'))

    // One section resolving (its fallback unmounts) while the others are still pending.
    rerender(
      <LoadingStatus>
        <MarketActionsSkeleton outcomes={2} />
        <MarketBetsSkeleton />
      </LoadingStatus>,
    )
    expect(screen.getAllByRole('status')).toHaveLength(1)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Loading…'))

    // Every section resolved: the status clears instead of announcing "Loading…" forever.
    rerender(<LoadingStatus>{null}</LoadingStatus>)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(''))
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })
})
