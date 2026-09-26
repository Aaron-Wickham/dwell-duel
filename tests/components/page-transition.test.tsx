// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { viewTransitionCalls as calls } from '@/tests/components/view-transition-mock'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import { Page } from '@/components/ui/page'
import {
  ContentReveal,
  DrillDownTransition,
  SkeletonReveal,
  TabTransition,
} from '@/components/nav/page-transition'

beforeEach(() => {
  calls.length = 0
})

describe('route transitions', () => {
  it.each([
    ['DrillDownTransition', DrillDownTransition],
    ['TabTransition', TabTransition],
    ['SkeletonReveal', SkeletonReveal],
    ['ContentReveal', ContentReveal],
  ])('%s slides for nav-forward and nav-back, fades otherwise, and stays still on updates', (_name, Wrapper) => {
    render(
      <Wrapper>
        <p>Page content</p>
      </Wrapper>,
    )

    expect(screen.getByText('Page content')).toBeInTheDocument()
    expect(calls).toHaveLength(1)
    expect(calls[0].enter).toEqual({ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-enter' })
    expect(calls[0].exit).toEqual({ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-exit' })
    expect(calls[0].default).toBe('none')
    expect(calls[0].name).toBeUndefined()
    expect(calls[0].share).toBeUndefined()
  })

  it('leaves a plain Page without a transition', () => {
    const { container } = render(<Page>Body</Page>)
    expect(calls).toHaveLength(0)
    expect(container.firstElementChild).toBe(screen.getByText('Body'))
  })

  it('wraps a tab Page in the route transition and adds no DOM of its own', () => {
    const { container } = render(<Page transition="tab">Body</Page>)
    expect(calls).toHaveLength(1)
    expect(calls[0].default).toBe('none')
    expect(container.firstElementChild).toBe(screen.getByText('Body'))
  })

  it('wraps a drilled-into Page in the route transition', () => {
    const { container } = render(<Page transition="drill-down">Body</Page>)
    expect(calls).toHaveLength(1)
    expect(calls[0].enter).toEqual({ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-enter' })
    expect(container.firstElementChild).toBe(screen.getByText('Body'))
  })
})
