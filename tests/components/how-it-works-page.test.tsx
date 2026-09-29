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
})
