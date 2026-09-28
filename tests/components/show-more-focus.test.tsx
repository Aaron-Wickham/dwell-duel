// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'

const nav = vi.hoisted(() => ({ pathname: '/admin/ledger', search: '' }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
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
      {/* Present regardless of `rows`, so a test can move focus here while rows are still streaming
          in, the way a member might click into an unrelated control before a slow list arrives. */}
      <button type="button">Filter</button>
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
  nav.pathname = '/admin/ledger'
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

  it('leaves focus where the member moved it, when the target renders after they focused something else', async () => {
    const { rerender } = render(<Ledger rows={[1, 2]} next={3} />)

    fireEvent.click(screen.getByRole('link', { name: 'Show more' }))
    nav.search = 'before=3'
    rerender(<Ledger rows={[]} />)
    expect(document.activeElement).toBe(document.body)

    // The member clicks into an unrelated control while the streamed rows are still on their way.
    act(() => screen.getByRole('button', { name: 'Filter' }).focus())
    rerender(<Ledger rows={[1, 2, 3, 4]} />)

    await waitFor(() => expect(document.getElementById('row-3')).not.toBeNull())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Filter' }))
  })

  it('drops a pending request outright on a navigation to a different pathname, even if its id happens to render there', () => {
    const { rerender } = render(<Ledger rows={[1, 2]} next={3} />)

    fireEvent.click(screen.getByRole('link', { name: 'Show more' }))
    // The member navigates away entirely (a nav-bar link, say) before /admin/ledger ever showed
    // row 3 -- not the same page extending its range, which only ever changes the search params.
    nav.pathname = '/feed'
    rerender(<Ledger rows={[1, 2, 3, 4]} />)
    expect(document.activeElement).toBe(document.body)

    // The request was cleared, not merely skipped for this one render: a later render on the new
    // page, even one that still has that id in the DOM, focuses nothing either.
    nav.search = 'x=1'
    rerender(<Ledger rows={[1, 2, 3, 4]} />)
    expect(document.activeElement).toBe(document.body)
  })
})
