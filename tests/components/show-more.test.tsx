// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'

// Vitest resolves next/link to the Pages Router Link, which drops scroll and replace before the
// DOM, so they are written onto the anchor for these assertions.
vi.mock('next/link', () => ({
  default: ({
    href,
    scroll,
    replace,
    ...props
  }: ComponentProps<'a'> & { href: string; scroll?: boolean; replace?: boolean }) => (
    <a href={href} data-scroll={String(scroll ?? true)} data-replace={String(replace ?? false)} {...props} />
  ),
}))

import { BackToNewest, ShowMore } from '@/components/ui/show-more'

describe('ShowMore', () => {
  it('is a real link to the next range, styled as a 44px secondary button with no underline', () => {
    render(<ShowMore href="/admin/ledger?before=abc" />)
    const link = screen.getByRole('link', { name: 'Show more' })
    expect(link).toHaveAttribute('href', '/admin/ledger?before=abc')
    expect(link).toHaveClass('min-h-11', 'no-underline', 'border-line-s', 'bg-surface', 'self-start')
  })

  it('keeps the scroll position and replaces the history entry', () => {
    render(<ShowMore href="/feed?before=abc" />)
    const link = screen.getByRole('link', { name: 'Show more' })
    expect(link).toHaveAttribute('data-scroll', 'false')
    expect(link).toHaveAttribute('data-replace', 'true')
  })
})

describe('BackToNewest', () => {
  it('links back to the newest rows with the same button styling', () => {
    render(<BackToNewest href="/markets" />)
    const link = screen.getByRole('link', { name: 'Back to newest' })
    expect(link).toHaveAttribute('href', '/markets')
    expect(link).toHaveClass('min-h-11', 'no-underline', 'self-start')
  })

  it('scrolls to the top as a normal navigation does, and replaces the history entry', () => {
    render(<BackToNewest href="/markets" />)
    const link = screen.getByRole('link', { name: 'Back to newest' })
    expect(link).toHaveAttribute('data-scroll', 'true')
    expect(link).toHaveAttribute('data-replace', 'true')
  })
})
