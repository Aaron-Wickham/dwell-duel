// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, within } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)
vi.mock('next/navigation', () => ({ usePathname: () => '/how-it-works/rules', useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }))

import HowItWorksPage from '@/app/(app)/how-it-works/page'
import HowItWorksRulesPage from '@/app/(app)/how-it-works/rules/page'

const source = readFileSync(path.resolve(import.meta.dirname, '../../docs/HOW-IT-WORKS.md'), 'utf8')
// Markdown emphasis in a heading renders as its text.
const headings = (level: number) =>
  [...source.matchAll(new RegExp(`^${'#'.repeat(level)} (.+)$`, 'gm'))].map((m) => m[1].replace(/[*`]/g, '').trim())

describe('the full rules page', () => {
  it('titles the page with the doc’s one h1', () => {
    render(<HowItWorksRulesPage />)
    expect(headings(1)).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(headings(1))
  })

  it('renders every h2 of the doc as a named section', () => {
    render(<HowItWorksRulesPage />)
    const h2s = headings(2)
    expect(h2s.length).toBeGreaterThan(3)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(h2s)
    for (const title of h2s) expect(screen.getByRole('region', { name: title })).toBeInTheDocument()
  })

  it('lists every section in a contents nav that links to its heading', () => {
    const { container } = render(<HowItWorksRulesPage />)
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
    const { container } = render(<HowItWorksRulesPage />)
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

  it('keeps the slip’s How parlays pay link pointed at a real section', () => {
    const { container } = render(<HowItWorksRulesPage />)
    expect(container.querySelector('#how-the-slip-solo-bets-and-parlays')?.tagName).toBe('H2')
  })

  it('keeps Settings’ Your data link pointed at the privacy section (#286)', () => {
    const { container } = render(<HowItWorksRulesPage />)
    const heading = container.querySelector('#how-your-data')
    expect(heading?.tagName).toBe('H2')
    expect(heading).toHaveTextContent('Your data')
  })

  it('points every in-body link at a section on the page, with the headings kept clear of the bar at every width', () => {
    const { container } = render(<HowItWorksRulesPage />)
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
    const { container } = render(<HowItWorksRulesPage />)
    expect(screen.getByRole('columnheader', { name: 'Kind' })).toBeInTheDocument()
    expect(container.querySelector('a[href$=".md"]')).toBeNull()
    expect(container).not.toHaveTextContent('**')
  })
})

// #398: the member version, with the full rules a tap away.
describe('the How it works page', () => {
  it('has one h1, then Betting, Parlays, Earning DC and When a market ends, each a named section', () => {
    render(<HowItWorksPage />)
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['How it works'])
    for (const title of ['Betting', 'Parlays', 'Earning DC', 'When a market ends']) {
      expect(screen.getByRole('region', { name: title })).toBeInTheDocument()
    }
    expect(screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Betting',
      'Parlays',
      'Earning DC',
      'When a market ends',
      'Questions',
    ])
  })

  it('asks the questions as native disclosures, collapsed, with 52px summaries', () => {
    const { container } = render(<HowItWorksPage />)
    const questions = within(screen.getByRole('region', { name: 'Questions' }))
    const details = [...container.querySelectorAll('details')]
    expect(details.map((d) => d.querySelector('summary')!.textContent)).toEqual([
      'What if a market is called off?',
      'Why did the chance change?',
      'Can I take a bet back?',
      'How do parlays pay?',
    ])
    for (const d of details) {
      expect(d).not.toHaveAttribute('open')
      expect(d.querySelector('summary')).toHaveClass('min-h-[52px]')
    }
    expect(questions.getByRole('link', { name: 'The parlay maths' })).toHaveAttribute(
      'href',
      '/how-it-works/rules#how-the-slip-solo-bets-and-parlays',
    )
  })

  it('links to the full rules, and no section is a card', () => {
    const { container } = render(<HowItWorksPage />)
    expect(screen.getByRole('link', { name: 'Read the full rules' })).toHaveAttribute('href', '/how-it-works/rules')
    expect(container.querySelector('.rounded-card')).toBeNull()
  })

  it('marks Getting started’s How it works step done on this device once opened', () => {
    document.cookie = 'read-how-it-works=; Max-Age=0; Path=/'
    render(<HowItWorksPage />)
    expect(document.cookie).toMatch(/(^|; )read-how-it-works=1/)
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

describe('arriving at a section from another page', () => {
  const original = Element.prototype.scrollIntoView
  function renderAt(hash: string): string[] {
    window.history.replaceState(null, '', `/how-it-works/rules${hash}`)
    const scrolled: string[] = []
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id)
    }
    render(<HowItWorksRulesPage />)
    return scrolled
  }
  afterEach(() => {
    Element.prototype.scrollIntoView = original
    window.history.replaceState(null, '', '/')
    vi.useRealTimers()
  })

  it('scrolls to the section in the URL once the doc has rendered, as a client navigation past the skeleton does not (#286)', () => {
    expect(renderAt('#how-your-data')).toEqual(['how-your-data'])
  })

  it('ignores a malformed hash instead of throwing', () => {
    expect(() => renderAt('#%E0%A4%A')).not.toThrow()
    expect(renderAt('#%E0%A4%A')).toEqual([])
  })

  it('leaves the restored position alone on back and forward', () => {
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(renderAt('#how-your-data')).toEqual([])
  })
})
