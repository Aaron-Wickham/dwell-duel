// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ prefetch, children, ...props }: { prefetch?: boolean | null; children: ReactNode }) => (
    <a {...props} data-prefetch={String(prefetch)}>
      {children}
    </a>
  ),
}))

import { IntentLink } from '@/components/ui/intent-link'

describe('IntentLink', () => {
  it.each([
    ['a pointer over it', (el: HTMLElement) => fireEvent.mouseEnter(el)],
    ['keyboard focus', (el: HTMLElement) => fireEvent.focus(el)],
  ])("doesn't prefetch on sight, and prefetches on %s", (_intent, show) => {
    const onMouseEnter = vi.fn()
    render(
      <IntentLink href="/markets" onMouseEnter={onMouseEnter}>
        Markets
      </IntentLink>,
    )
    const link = screen.getByRole('link', { name: 'Markets' })
    expect(link).toHaveAttribute('data-prefetch', 'false')

    show(link)
    expect(link).toHaveAttribute('data-prefetch', 'null')
  })

  it('prefetches on a finger down only when asked to, as the nav does', () => {
    render(
      <>
        <IntentLink href="/markets">Row</IntentLink>
        <IntentLink href="/feed" prefetchOnTouch>
          Tab
        </IntentLink>
      </>,
    )
    const row = screen.getByRole('link', { name: 'Row' })
    const tab = screen.getByRole('link', { name: 'Tab' })
    fireEvent.touchStart(row)
    fireEvent.touchStart(tab)
    expect(row).toHaveAttribute('data-prefetch', 'false')
    expect(tab).toHaveAttribute('data-prefetch', 'null')
  })

  it("still calls the caller's own handler", () => {
    const onMouseEnter = vi.fn()
    render(
      <IntentLink href="/markets" onMouseEnter={onMouseEnter}>
        Markets
      </IntentLink>,
    )
    fireEvent.mouseEnter(screen.getByRole('link', { name: 'Markets' }))
    expect(onMouseEnter).toHaveBeenCalledTimes(1)
  })

  // #251: the nav, sub-nav and dense list rows are what viewport prefetch rendered most often.
  it.each([
    'components/app-nav/app-nav.tsx',
    'components/ui/sub-nav.tsx',
    'components/markets/market-card.tsx',
    'components/feed/feed-item.tsx',
    'components/leaderboard/leaderboard-row.tsx',
    'app/(app)/bets/bet-rows.tsx',
  ])('%s links through IntentLink', (file) => {
    const source = readFileSync(path.resolve(import.meta.dirname, '../..', file), 'utf8')
    expect(source).not.toMatch(/from 'next\/link'/)
    expect(source).toMatch(/<IntentLink\b/)
  })
})
