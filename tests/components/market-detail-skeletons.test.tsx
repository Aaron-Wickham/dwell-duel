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
  MarketOutcomesSkeleton,
  MarketPositionSkeleton,
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

// The chart and outcomes sit in the page's left-top wrapper, bets and comments in its left-bottom
// one, so those carry no grid placement of their own; the position and bet column do.
describe.each<[string, ReactElement, string[]]>([
  ['market-position', <MarketPositionSkeleton key="position" rows={2} />, ['lg:col-start-2', 'lg:row-start-1']],
  ['market-chart', <MarketChartSkeleton key="chart" />, []],
  ['market-outcomes', <MarketOutcomesSkeleton key="outcomes" outcomes={2} />, []],
  ['market-bet-form', <MarketActionsSkeleton key="actions" hasPosition />, ['lg:col-start-2', 'lg:row-span-2', 'lg:row-start-2']],
  // With no Your position card the bet column starts level with the chart, not in an empty row's wake.
  ['market-bet-form', <MarketActionsSkeleton key="actions-alone" hasPosition={false} />, ['lg:col-start-2', 'lg:row-span-3', 'lg:row-start-1']],
  ['market-bets', <MarketBetsSkeleton key="bets" />, []],
  ['market-comments', <MarketCommentsSkeleton key="comments" />, []],
])('the %s skeleton', (name, element, placement) => {
  it('is named, holds its grid cell, announces nothing itself, and shows nothing but hidden blocks', () => {
    const { container } = render(element)

    const screenEl = container.querySelector(`[data-skeleton="${name}"]`)
    expect(screenEl).not.toBeNull()
    if (placement.length > 0) expect(screenEl).toHaveClass(...placement)
    else expect(screenEl?.className ?? '').not.toMatch(/lg:(col|row)-/)
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
    const { container } = render(<MarketActionsSkeleton hasPosition={false} />)

    const card = container.querySelector('[data-skeleton="market-bet-form"] .rounded-card')!
    expect(card).toHaveClass('gap-2')
    expect(card.querySelectorAll('.skeleton.h-12, .skeleton.h-11')).toHaveLength(0)
    expect(card.querySelectorAll('.skeleton.h-5')).toHaveLength(2)
  })
})

describe('the market outcomes skeleton', () => {
  it('draws one outcome row per outcome', () => {
    const { container } = render(<MarketOutcomesSkeleton outcomes={4} />)

    const rows = container.querySelector('[data-skeleton="market-outcomes"] .divide-y')
    expect(rows?.children).toHaveLength(4)
  })
})

describe('the market position skeleton', () => {
  it('draws a row per bet or parlay, at most four, in the card’s primary border', () => {
    const { container } = render(<MarketPositionSkeleton rows={6} />)

    expect(container.querySelector('.rounded-card')).toHaveClass('border-2', 'border-primary')
    expect(container.querySelector('[data-skeleton="market-position"] .divide-y')?.children).toHaveLength(4)
  })
})
