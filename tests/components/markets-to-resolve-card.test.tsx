// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MarketsToResolveCard } from '@/components/home/markets-to-resolve-card'

vi.mock('next/link', () => ({
  default: ({ href, transitionTypes: _transitionTypes, ...props }: ComponentProps<'a'> & { href: string; transitionTypes?: string[] }) => (
    <a href={href} {...props} />
  ),
}))

const market = (n: number) => ({ id: `m${n}`, title: `Market ${n}`, closeAt: '2026-09-25T12:00:00Z' })

describe('MarketsToResolveCard', () => {
  it('renders nothing when no market is waiting', () => {
    const { container } = render(<MarketsToResolveCard total={0} markets={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names its region with the count and links each market with when it closed', () => {
    render(<MarketsToResolveCard total={2} markets={[market(1), market(2)]} />)
    const region = screen.getByRole('region', { name: 'Markets to resolve (2)' })
    expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent('Markets to resolve (2)')
    const links = within(region).getAllByRole('link')
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Market 1', '/markets/m1'],
      ['Market 2', '/markets/m2'],
    ])
    expect(links[0]).toHaveClass('hit-area')
    expect(region.querySelector('time')).toHaveAttribute('datetime', '2026-09-25T12:00:00Z')
    expect(within(region).queryByText(/more under/)).toBeNull()
  })

  it('counts every waiting market, and points to the rest when the list is capped', () => {
    render(<MarketsToResolveCard total={13} markets={Array.from({ length: 10 }, (_, i) => market(i))} />)
    const region = screen.getByRole('region', { name: 'Markets to resolve (13)' })
    expect(within(region).getByText(/And 3 more under/)).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: 'Awaiting resolution' })).toHaveAttribute('href', '/markets')
  })
})
