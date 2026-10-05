// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import {
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

// Each section's wrapper on the page carries its place in the phone order and the lg columns, so
// no skeleton carries a placement of its own.
describe.each<[string, ReactElement]>([
  ['market-position', <MarketPositionSkeleton key="position" rows={2} />],
  ['market-chart', <MarketChartSkeleton key="chart" />],
  ['market-outcomes', <MarketOutcomesSkeleton key="outcomes" outcomes={2} canBet />],
  ['market-outcomes', <MarketOutcomesSkeleton key="outcomes-closed" outcomes={2} canBet={false} />],
  ['market-bets', <MarketBetsSkeleton key="bets" />],
  ['market-comments', <MarketCommentsSkeleton key="comments" />],
])('the %s skeleton', (name, element) => {
  it('is named, holds no grid cell of its own, announces nothing itself, and shows nothing but hidden blocks', () => {
    const { container } = render(element)

    const screenEl = container.querySelector(`[data-skeleton="${name}"]`)
    expect(screenEl).not.toBeNull()
    expect(screenEl?.className ?? '').not.toMatch(/lg:(col|row)-|order-/)
    expectOnlyHiddenBlocks(container)
  })
})

describe('the market chart skeleton', () => {
  it('draws the range row and the tick row around the plot, as the chart does', () => {
    const { container } = render(<MarketChartSkeleton />)

    const plot = container.querySelector('.skeleton.h-\\[220px\\]')!
    expect(plot).toHaveClass('md:h-[300px]')
    expect(plot.previousElementSibling).toHaveClass('h-[52px]')
    expect(plot.nextElementSibling).toHaveClass('skeleton', 'h-5')
  })
})

describe('the market outcomes skeleton', () => {
  it('draws one outcome row per outcome, each with its payout line and Add while it takes bets', () => {
    const { container } = render(<MarketOutcomesSkeleton outcomes={4} canBet />)

    const rows = container.querySelector('[data-skeleton="market-outcomes"] .divide-y')
    expect(rows?.children).toHaveLength(4)
    expect(rows?.querySelectorAll('.skeleton.h-11')).toHaveLength(4)
    expect(container.querySelector('.skeleton.rounded-tile')).toBeNull()
  })

  it('draws no Add once betting has closed, and the result block above the rows instead', () => {
    const { container } = render(<MarketOutcomesSkeleton outcomes={2} canBet={false} />)

    const rows = container.querySelector('[data-skeleton="market-outcomes"] .divide-y')
    expect(rows?.querySelectorAll('.skeleton.h-11')).toHaveLength(0)
    expect(container.querySelector('.skeleton.rounded-tile')).not.toBeNull()
  })

  // #390: the real card's heights, so the rail under it doesn't move when the outcomes land.
  it('draws each row at its real height, and the parlay line only when something rides in parlays', () => {
    const { container, rerender } = render(<MarketOutcomesSkeleton outcomes={2} canBet />)
    const rows = () => container.querySelector('[data-skeleton="market-outcomes"] .divide-y')!
    for (const row of rows().children) expect(row).toHaveClass('h-[70px]')
    expect(container.querySelector('.border-t.pt-3')).toBeNull()
    rerender(<MarketOutcomesSkeleton outcomes={2} canBet ridingNote />)
    expect(container.querySelector('.border-t.pt-3')).not.toBeNull()
  })

  it('opens a market waiting on its result with one plain line, not a banner', () => {
    const { container } = render(<MarketOutcomesSkeleton outcomes={2} canBet={false} waiting />)
    expect(container.querySelector('.skeleton.rounded-tile')).toBeNull()
    expect(container.querySelector('.h-8.pb-2')).not.toBeNull()
  })
})

describe('the market position skeleton', () => {
  it('draws a row per bet or parlay, at most four, in the card’s ink border', () => {
    const { container } = render(<MarketPositionSkeleton rows={6} />)

    expect(container.querySelector('.rounded-card')).toHaveClass('border-2', 'border-ink')
    expect(container.querySelector('[data-skeleton="market-position"] .divide-y')?.children).toHaveLength(4)
  })
})
