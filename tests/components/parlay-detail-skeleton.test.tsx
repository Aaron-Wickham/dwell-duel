// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import { ParlayDetailSkeleton } from '@/components/parlays/parlay-detail-skeleton'

// The parlay page streams its three sections behind this one fallback under a <LoadingStatus />,
// so like the market page's fallbacks it announces nothing itself and adds nothing the e2e specs
// count.
describe('the parlay detail skeleton', () => {
  it('holds each section’s grid cell and shows nothing but hidden blocks', () => {
    const { container } = render(<ParlayDetailSkeleton legs={3} />)

    const screens = [...container.querySelectorAll('[data-skeleton]')]
    expect(screens.map((s) => s.getAttribute('data-skeleton'))).toEqual(['parlay-summary', 'parlay-picks', 'parlay-maths'])
    expect(screens[0]).toHaveClass('lg:col-start-2', 'lg:row-start-1')
    expect(screens[1]).toHaveClass('lg:col-start-1', 'lg:row-span-2', 'lg:row-start-1')
    expect(screens[2]).toHaveClass('lg:col-start-2', 'lg:row-start-2')

    expect(screen.queryAllByRole('status')).toHaveLength(0)
    for (const block of container.querySelectorAll('.skeleton')) expect(block).toHaveAttribute('aria-hidden', 'true')
    for (const role of ['heading', 'listitem', 'link', 'button', 'region'] as const) {
      expect(screen.queryAllByRole(role)).toHaveLength(0)
    }
    expect(container).toHaveTextContent(/^$/)
  })

  it('draws one pick row and one progress segment per leg', () => {
    const { container } = render(<ParlayDetailSkeleton legs={4} />)

    expect(container.querySelector('[data-skeleton="parlay-picks"] .divide-y')?.children).toHaveLength(4)
    expect(container.querySelector('[data-skeleton="parlay-summary"] .gap-\\[3px\\]')?.children).toHaveLength(4)
  })
})
