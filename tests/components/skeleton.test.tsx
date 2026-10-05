// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { viewTransitionCalls } from '@/tests/components/view-transition-mock'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import { Skeleton, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'

beforeEach(() => {
  viewTransitionCalls.length = 0
})

describe('Skeleton', () => {
  it('is a hidden block carrying the shimmer class and any overrides', () => {
    const { container } = render(<Skeleton className="h-6 w-40 rounded-full" />)
    const block = container.firstElementChild!
    expect(block).toHaveAttribute('aria-hidden', 'true')
    expect(block).toHaveClass('skeleton', 'h-6', 'w-40', 'rounded-full')
    expect(block).toBeEmptyDOMElement()
  })

  it('builds a field from a label bar and a control bar, taller for a textarea', () => {
    const { container } = render(
      <>
        <SkeletonField />
        <SkeletonField tall />
      </>,
    )
    const [field, tallField] = Array.from(container.children)
    expect(field.lastElementChild).toHaveClass('h-12')
    expect(tallField.lastElementChild).toHaveClass('h-[100px]')
  })
})

describe('SkeletonScreen', () => {
  it('names the skeleton, announces loading, and hands off through the route transition', () => {
    const { container } = render(
      <SkeletonScreen name="feed" className="flex flex-col">
        <Skeleton className="h-6" />
      </SkeletonScreen>,
    )
    expect(viewTransitionCalls).toHaveLength(1)
    expect(viewTransitionCalls[0].exit).toEqual({ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', 'nav-tab': 'none', default: 'page-exit' })
    expect(viewTransitionCalls[0].default).toBe('none')
    const screenEl = container.firstElementChild!
    expect(screenEl).toHaveAttribute('data-skeleton', 'feed')
    expect(screenEl).toHaveClass('flex', 'flex-col')
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screenEl.querySelectorAll('.skeleton')).toHaveLength(1)
  })

  it('renders no status when announce is false, for a page with its own combined one', () => {
    render(
      <SkeletonScreen name="market-chart" announce={false} className="flex flex-col">
        <Skeleton className="h-6" />
      </SkeletonScreen>,
    )
    expect(screen.queryByRole('status')).toBeNull()
  })
})
