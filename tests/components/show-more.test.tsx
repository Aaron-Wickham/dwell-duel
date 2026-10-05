// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'

const { requestShowMoreFocus } = vi.hoisted(() => ({ requestShowMoreFocus: vi.fn() }))
vi.mock('@/components/ui/show-more-focus', () => ({ requestShowMoreFocus }))

// Vitest resolves next/link to the Pages Router Link, which drops scroll and replace before the
// DOM, so they are written onto the anchor for these assertions. A plain click runs onNavigate,
// as the App Router's Link does for a client-side navigation.
vi.mock('next/link', () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({
    href,
    scroll,
    replace,
    onNavigate,
    ...props
  }: ComponentProps<'a'> & { href: string; scroll?: boolean; replace?: boolean; onNavigate?: () => void }) => (
    <a
      href={href}
      data-scroll={String(scroll ?? true)}
      data-replace={String(replace ?? false)}
      data-on-navigate={String(Boolean(onNavigate))}
      onClick={(event) => {
        event.preventDefault()
        onNavigate?.()
      }}
      {...props}
    />
  ),
}))

import { BackToNewest, ShowMore } from '@/components/ui/show-more'

beforeEach(() => {
  requestShowMoreFocus.mockReset()
})

describe('ShowMore', () => {
  it('is a real link to the next range, styled as a 44px secondary button with no underline', () => {
    render(<ShowMore href="/admin/ledger?before=abc" />)
    const link = screen.getByRole('link', { name: 'Show more' })
    expect(link).toHaveAttribute('href', '/admin/ledger?before=abc')
    expect(link).toHaveClass('min-h-11', 'no-underline', 'border-line-s', 'bg-surface', 'self-start')
  })

  it('keeps the scroll position and replaces the history entry, by default', () => {
    render(<ShowMore href="/feed?before=abc" />)
    const link = screen.getByRole('link', { name: 'Show more' })
    expect(link).toHaveAttribute('data-scroll', 'false')
    expect(link).toHaveAttribute('data-replace', 'true')
  })

  it('scrolls to the top like a normal navigation when it starts a fresh window', () => {
    render(<ShowMore href="/admin/ledger?before_from=abc" fresh />)
    const link = screen.getByRole('link', { name: 'Show more' })
    expect(link).toHaveAttribute('data-scroll', 'true')
    expect(link).toHaveAttribute('data-replace', 'true')
  })

  it('asks for focus on the first new row when its navigation starts, and keeps the href to the range alone', () => {
    render(<ShowMore href="/feed?before=abc" focusId="feed-bet_003a7" />)
    const link = screen.getByRole('link', { name: 'Show more' })
    expect(link).toHaveAttribute('href', '/feed?before=abc')
    expect(requestShowMoreFocus).not.toHaveBeenCalled()

    fireEvent.click(link)
    expect(requestShowMoreFocus).toHaveBeenCalledExactlyOnceWith('feed-bet_003a7')
  })

  it('asks for nothing without a focus target', () => {
    render(<ShowMore href="/feed?before=abc" />)
    expect(screen.getByRole('link', { name: 'Show more' })).toHaveAttribute('data-on-navigate', 'false')
  })

  it('keeps its name and adds a description of the list it extends, when given one', () => {
    render(<ShowMore href="/markets?open=abc" description="Open markets" />)
    const link = screen.getByRole('link', { name: 'Show more' })
    expect(link).toHaveAccessibleDescription('Open markets')
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
