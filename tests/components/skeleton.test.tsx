// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { viewTransitionCalls } from '@/tests/components/view-transition-mock'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import { Skeleton, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'
import { ContentReveal, SkeletonReveal } from '@/components/nav/page-transition'
import { Page } from '@/components/ui/page'

beforeEach(() => {
  viewTransitionCalls.length = 0
})

// The props a ViewTransition got, apart from its children.
function transitionProps(index = 0) {
  return Object.fromEntries(Object.entries(viewTransitionCalls[index]).filter(([key]) => key !== 'children'))
}

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
  it('names the skeleton, announces loading, and hands off through the skeleton reveal', () => {
    const { container } = render(
      <SkeletonScreen name="feed" className="flex flex-col">
        <Skeleton className="h-6" />
      </SkeletonScreen>,
    )
    expect(viewTransitionCalls).toHaveLength(1)
    expect(transitionProps()).toEqual({ exit: 'skeleton-exit', default: 'none' })
    const screenEl = container.firstElementChild!
    expect(screenEl).toHaveAttribute('data-skeleton', 'feed')
    expect(screenEl).toHaveClass('flex', 'flex-col')
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screenEl.querySelectorAll('.skeleton')).toHaveLength(1)
  })
})

describe('reveals', () => {
  it('slides the skeleton out on exit and nothing else', () => {
    render(<SkeletonReveal>skeleton</SkeletonReveal>)
    expect(transitionProps()).toEqual({ exit: 'skeleton-exit', default: 'none' })
  })

  it('brings the content in on enter and nothing else', () => {
    render(<ContentReveal>content</ContentReveal>)
    expect(transitionProps()).toEqual({ enter: 'content-enter', default: 'none' })
  })

  it('reveals a Page that asks for it, and leaves a plain Page alone', () => {
    const { container, rerender } = render(<Page>Body</Page>)
    expect(viewTransitionCalls).toHaveLength(0)
    rerender(<Page reveal>Body</Page>)
    expect(viewTransitionCalls).toHaveLength(1)
    expect(transitionProps()).toEqual({ enter: 'content-enter', default: 'none' })
    expect(container.firstElementChild).toBe(screen.getByText('Body'))
  })
})
