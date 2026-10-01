// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)
vi.mock('next/navigation', () => ({ usePathname: () => '/how-it-works', useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }))

import HowItWorksPage from '@/app/(app)/how-it-works/page'

const source = readFileSync(path.resolve(import.meta.dirname, '../../docs/HOW-IT-WORKS.md'), 'utf8')
// Markdown emphasis in a heading renders as its text.
const headings = (level: number) =>
  [...source.matchAll(new RegExp(`^${'#'.repeat(level)} (.+)$`, 'gm'))].map((m) => m[1].replace(/[*`]/g, '').trim())

describe('the How it works page', () => {
  it('titles the page with the doc’s one h1', () => {
    render(<HowItWorksPage />)
    expect(headings(1)).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(headings(1))
  })

  it('renders every h2 of the doc as a named section', () => {
    render(<HowItWorksPage />)
    const h2s = headings(2)
    expect(h2s.length).toBeGreaterThan(3)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(h2s)
    for (const title of h2s) expect(screen.getByRole('region', { name: title })).toBeInTheDocument()
  })

  it('lists every section in a contents nav that links to its heading', () => {
    const { container } = render(<HowItWorksPage />)
    const nav = screen.getByRole('navigation', { name: 'Contents' })
    const links = [...nav.querySelectorAll('a')]
    expect(links.map((a) => a.textContent)).toEqual(headings(2))
    for (const link of links) {
      const target = container.querySelector(link.getAttribute('href')!)
      expect(target?.tagName).toBe('H2')
      expect(target).toHaveTextContent(link.textContent!)
    }
  })

  it('opens with the short version, then a collapsed On this page list for phones linking every section below it (#260)', () => {
    const { container } = render(<HowItWorksPage />)
    const h2s = headings(2)
    expect(h2s[0]).toBe('The short version')
    const details = container.querySelector('details')!
    expect(details).not.toHaveAttribute('open')
    expect(details).toHaveClass('lg:hidden')
    expect(details.previousElementSibling).toBe(screen.getByRole('region', { name: 'The short version' }))
    expect(details.querySelector('summary')).toHaveTextContent('On this page')
    const links = [...screen.getByRole('navigation', { name: 'On this page', hidden: true }).querySelectorAll('a')]
    expect(links.map((a) => a.textContent)).toEqual(h2s.slice(1))
    for (const link of links) {
      expect(link).toHaveClass('min-h-11')
      expect(container.querySelector(link.getAttribute('href')!)?.tagName).toBe('H2')
    }
  })

  it('marks Getting started’s How it works step done on this device once opened', () => {
    document.cookie = 'read-how-it-works=; Max-Age=0; Path=/'
    render(<HowItWorksPage />)
    expect(document.cookie).toMatch(/(^|; )read-how-it-works=1/)
  })

  it('keeps the slip’s How parlays pay link pointed at a real section', () => {
    const { container } = render(<HowItWorksPage />)
    expect(container.querySelector('#how-the-slip-solo-bets-and-parlays')?.tagName).toBe('H2')
  })

  it('points every in-body link at a section on the page, with the headings kept clear of the bar at every width', () => {
    const { container } = render(<HowItWorksPage />)
    const navs = container.querySelectorAll('nav')
    const inBody = [...container.querySelectorAll('a[href^="#"]')].filter((a) => ![...navs].some((nav) => nav.contains(a)))
    expect(inBody.length).toBeGreaterThan(0)
    for (const link of inBody) {
      const target = container.querySelector(link.getAttribute('href')!)
      expect(target, link.outerHTML).not.toBeNull()
      expect(target?.tagName).toBe('H2')
    }
    const body = container.querySelector('h2[id^="how-"]')!.closest('[class*="scroll-mt"]')!
    expect(body.className).toMatch(/(^|\s)\[&_h2\]:scroll-mt-\[calc\(64px\+var\(--safe-top\)\+40px\)\]/)
    expect(body.className).toMatch(/md:\[&_h2\]:scroll-mt-\[calc\(72px\+var\(--safe-top\)\+48px\)\]/)
    expect(body.className).not.toMatch(/lg:\[&_h2\]:scroll-mt/)
  })

  it('renders tables with column headers and links nothing to repo files', () => {
    const { container } = render(<HowItWorksPage />)
    expect(screen.getByRole('columnheader', { name: 'Kind' })).toBeInTheDocument()
    expect(container.querySelector('a[href$=".md"]')).toBeNull()
    expect(container).not.toHaveTextContent('**')
  })
})

describe('Markdown links', () => {
  it('shows a link to a repo file as plain text, and keeps app and web links', async () => {
    const { InlineContent } = await import('@/components/docs/markdown')
    const { parseInline } = await import('@/lib/docs/markdown')
    const { container } = render(<p><InlineContent nodes={parseInline('[the code](ARCHITECTURE.md), [markets](/markets), [site](https://example.com)')} /></p>)
    expect(container.querySelector('a[href$=".md"]')).toBeNull()
    expect(container).toHaveTextContent('the code')
    expect(container.querySelector('a[href="/markets"]')).not.toBeNull()
    expect(container.querySelector('a[href="https://example.com"]')).not.toBeNull()
  })

  it('points a doc anchor at the page’s section id, and leaves one already pointed there alone', async () => {
    const { InlineContent } = await import('@/components/docs/markdown')
    const { parseInline } = await import('@/lib/docs/markdown')
    const { container } = render(<p><InlineContent nodes={parseInline('[board](#the-leaderboard), [same](#how-the-leaderboard)')} /></p>)
    expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['#how-the-leaderboard', '#how-the-leaderboard'])
  })
})
