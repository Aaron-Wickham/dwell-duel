// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn<() => string | null>() }))
vi.mock('next/navigation', () => ({ usePathname }))

import { NotFoundBody } from '@/components/not-found/not-found-body'

describe('NotFoundBody', () => {
  beforeEach(() => usePathname.mockReturnValue('/nowhere'))

  it('names the page and offers a way back home', () => {
    render(<NotFoundBody />)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByText('The link may be old, or what it pointed to was removed.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/')
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it.each([
    ['/markets/0b5e', 'Back to Markets', '/markets'],
    ['/members/0b5e', 'Back to Leaderboard', '/leaderboard'],
    ['/parlays/0b5e', 'Back to My bets', '/bets'],
    ['/how-it-works/nothing', 'Back to How it works', '/how-it-works'],
    ['/admin/members/0b5e', 'Back to Members', '/admin/members'],
  ])('on %s, also offers the way back to its parent', (pathname, name, href) => {
    usePathname.mockReturnValue(pathname)
    render(<NotFoundBody />)
    expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
  })

  // #387: the giant numeral was decoration that pushed the words down.
  it('draws no 404 numeral', () => {
    const { container } = render(<NotFoundBody />)
    expect(container).not.toHaveTextContent('404')
  })
})
