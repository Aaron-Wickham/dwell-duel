// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import {
  MarketActionsSkeleton,
  MarketBetsSkeleton,
  MarketChartSkeleton,
  MarketCommentsSkeleton,
} from '@/components/markets/market-detail-skeletons'

// The fallbacks sit on the page beside real content, so like a route skeleton they must add
// nothing the market e2e specs count. None of them announces its own status any more (the
// page renders one combined <LoadingStatus />, tested in loading-status.test.tsx): asserting zero
// here is what would catch a status creeping back into one of them.
function expectOnlyHiddenBlocks(container: HTMLElement) {
  expect(screen.queryAllByRole('status')).toHaveLength(0)
  expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(1)
  for (const block of container.querySelectorAll('.skeleton')) {
    expect(block).toHaveAttribute('aria-hidden', 'true')
  }
  for (const role of ['heading', 'listitem', 'link', 'button', 'region'] as const) {
    expect(screen.queryAllByRole(role)).toHaveLength(0)
  }
  expect(container).toHaveTextContent(/^$/)
}

describe.each<[string, ReactElement, string[]]>([
  ['market-chart', <MarketChartSkeleton key="chart" />, ['lg:col-start-1', 'lg:row-start-1']],
  ['market-bets', <MarketBetsSkeleton key="bets" />, ['lg:col-start-1', 'lg:row-start-3']],
  ['market-comments', <MarketCommentsSkeleton key="comments" />, ['lg:col-start-1', 'lg:row-start-4']],
])('the %s skeleton', (name, element, placement) => {
  it('is named, holds its grid cell, announces nothing itself, and shows nothing but hidden blocks', () => {
    const { container } = render(element)

    const screenEl = container.querySelector(`[data-skeleton="${name}"]`)
    expect(screenEl).not.toBeNull()
    expect(screenEl).toHaveClass(...placement)
    expectOnlyHiddenBlocks(container)
  })
})

describe('the market chart skeleton', () => {
  it('draws the range row and the tick row around the plot, as the chart does', () => {
    const { container } = render(<MarketChartSkeleton />)

    const plot = container.querySelector('.skeleton.h-\\[220px\\]')!
    expect(plot).toHaveClass('md:h-[300px]')
    expect(plot.previousElementSibling).toHaveClass('min-h-11')
    expect(plot.nextElementSibling).toHaveClass('skeleton', 'h-5')
  })
})

describe('the market actions skeleton', () => {
  it('draws the bet column as a heading and a short paragraph, with nothing to fill in', () => {
    const { container } = render(<MarketActionsSkeleton outcomes={2} />)

    const card = container.querySelector('[data-skeleton="market-bet-form"] .rounded-card')!
    expect(card).toHaveClass('gap-2')
    expect(card.querySelectorAll('.skeleton.h-12, .skeleton.h-11')).toHaveLength(0)
    expect(card.querySelectorAll('.skeleton.h-5')).toHaveLength(2)
  })

  it('stands in for the outcomes card and the bet column, each in its own grid cell', () => {
    const { container } = render(<MarketActionsSkeleton outcomes={2} />)

    const [outcomes, betForm] = Array.from(container.querySelectorAll('[data-skeleton]'))
    expect(outcomes).toHaveAttribute('data-skeleton', 'market-outcomes')
    expect(outcomes).toHaveClass('lg:col-start-1', 'lg:row-start-2')
    expect(betForm).toHaveAttribute('data-skeleton', 'market-bet-form')
    expect(betForm).toHaveClass('lg:col-start-2', 'lg:row-span-4', 'lg:row-start-1')
    expectOnlyHiddenBlocks(container)
  })

  it('draws one outcome row per outcome', () => {
    const { container } = render(<MarketActionsSkeleton outcomes={4} />)

    const rows = container.querySelector('[data-skeleton="market-outcomes"] .divide-y')
    expect(rows?.children).toHaveLength(4)
  })
})
