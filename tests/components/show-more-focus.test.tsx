// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'

const nav = vi.hoisted(() => ({ search: '' }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/ledger',
  useSearchParams: () => new URLSearchParams(nav.search),
}))

// A plain click runs onNavigate, as the App Router's Link does for a client-side navigation. The
// tests then play the router's part: change the URL and render the page it returns.
vi.mock('next/link', () => ({
  default: ({
    href,
    scroll: _scroll,
    replace: _replace,
    onNavigate,
    ...props
  }: ComponentProps<'a'> & { href: string; scroll?: boolean; replace?: boolean; onNavigate?: () => void }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault()
        onNavigate?.()
      }}
      {...props}
    />
  ),
}))

import { ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'

function Ledger({ rows, next }: { rows: number[]; next?: number }) {
  return (
    <>
      <ShowMoreFocus />
      <ul>
        {rows.map((n) => (
          <li key={n} id={`row-${n}`} tabIndex={-1}>
            Row {n}
          </li>
        ))}
      </ul>
      {next !== undefined && <ShowMore href={`/admin/ledger?before=${next}`} focusId={`row-${next}`} />}
    </>
  )
}

afterEach(() => {
  nav.search = ''
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('ShowMoreFocus', () => {
  it('moves focus to the first new row once the extended list renders, without scrolling', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    const { rerender } = render(<Ledger rows={[1, 2]} next={3} />)

    fireEvent.click(screen.getByRole('link', { name: 'Show more' }))
    nav.search = 'before=3'
    rerender(<Ledger rows={[1, 2, 3, 4]} />)

    expect(document.activeElement).toBe(document.getElementById('row-3'))
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
  })

  it('waits for a row that renders after the navigation commits, as a streamed list does', async () => {
    const { rerender } = render(<Ledger rows={[1, 2]} next={3} />)

    fireEvent.click(screen.getByRole('link', { name: 'Show more' }))
    nav.search = 'before=3'
    rerender(<Ledger rows={[]} />)
    expect(document.activeElement).toBe(document.body)

    rerender(<Ledger rows={[1, 2, 3, 4]} />)
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('row-3')))
  })

  it('moves focus only once, not again on a later navigation that renders the same row', async () => {
    const { rerender } = render(<Ledger rows={[1, 2]} next={3} />)
    fireEvent.click(screen.getByRole('link', { name: 'Show more' }))
    nav.search = 'before=3'
    rerender(<Ledger rows={[1, 2, 3, 4]} />)
    expect(document.activeElement).toBe(document.getElementById('row-3'))

    act(() => document.getElementById('row-1')!.focus())
    nav.search = 'before=3&tab=x'
    rerender(<Ledger rows={[1, 2, 3, 4]} />)
    expect(document.activeElement).toBe(document.getElementById('row-1'))
  })

  it('leaves focus alone on a navigation no Show more started', () => {
    const { rerender } = render(<Ledger rows={[1, 2]} />)
    nav.search = 'before=3'
    rerender(<Ledger rows={[1, 2, 3, 4]} />)
    expect(document.activeElement).toBe(document.body)
  })

  it('gives up on a row that hasn’t rendered within ten seconds', () => {
    vi.useFakeTimers()
    const { rerender } = render(<Ledger rows={[1, 2]} next={3} />)
    fireEvent.click(screen.getByRole('link', { name: 'Show more' }))
    nav.search = 'before=3'
    rerender(<Ledger rows={[]} />)

    act(() => vi.advanceTimersByTime(10_001))
    rerender(<Ledger rows={[1, 2, 3, 4]} />)
    nav.search = 'before=3&tab=x'
    rerender(<Ledger rows={[1, 2, 3, 4]} />)

    expect(document.activeElement).toBe(document.body)
  })
})
