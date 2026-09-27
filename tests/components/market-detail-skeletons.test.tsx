// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import { MarketActionsSkeleton, MarketBetsSkeleton, MarketChartSkeleton } from '@/components/markets/market-detail-skeletons'

// The fallbacks sit on the page beside real content, so like a route skeleton they must add
// nothing the market e2e specs count.
function expectOnlyHiddenBlocks(container: HTMLElement, statuses: number) {
  expect(screen.getAllByRole('status')).toHaveLength(statuses)
  for (const status of screen.getAllByRole('status')) expect(status).toHaveTextContent('Loading…')
  expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(1)
  for (const block of container.querySelectorAll('.skeleton')) {
    expect(block).toHaveAttribute('aria-hidden', 'true')
  }
  for (const role of ['heading', 'listitem', 'link', 'button', 'region'] as const) {
    expect(screen.queryAllByRole(role)).toHaveLength(0)
  }
  expect(container).toHaveTextContent(new RegExp(`^(Loading…){${statuses}}$`))
}

describe.each<[string, ReactElement, string[]]>([
  ['market-chart', <MarketChartSkeleton key="chart" />, ['lg:col-start-1', 'lg:row-start-1']],
  ['market-bets', <MarketBetsSkeleton key="bets" />, ['lg:col-start-1', 'lg:row-start-3']],
])('the %s skeleton', (name, element, placement) => {
  it('is named, announces loading, holds its grid cell, and shows nothing but hidden blocks', () => {
    const { container } = render(element)

    const screenEl = container.querySelector(`[data-skeleton="${name}"]`)
    expect(screenEl).not.toBeNull()
    expect(screenEl).toHaveClass(...placement)
    expectOnlyHiddenBlocks(container, 1)
  })
})

describe('the market actions skeleton', () => {
  it('stands in for the outcomes card and the bet column, each in its own grid cell', () => {
    const { container } = render(<MarketActionsSkeleton outcomes={2} />)

    const [outcomes, betForm] = Array.from(container.querySelectorAll('[data-skeleton]'))
    expect(outcomes).toHaveAttribute('data-skeleton', 'market-outcomes')
    expect(outcomes).toHaveClass('lg:col-start-1', 'lg:row-start-2')
    expect(betForm).toHaveAttribute('data-skeleton', 'market-bet-form')
    expect(betForm).toHaveClass('lg:col-start-2', 'lg:row-span-3', 'lg:row-start-1')
    expectOnlyHiddenBlocks(container, 2)
  })

  it('draws one outcome row per outcome', () => {
    const { container } = render(<MarketActionsSkeleton outcomes={4} />)

    const rows = container.querySelector('[data-skeleton="market-outcomes"] .divide-y')
    expect(rows?.children).toHaveLength(4)
  })
})
