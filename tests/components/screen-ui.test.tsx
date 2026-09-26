// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChartColumn } from 'lucide-react'
import { Page, PageHeader, h1Class, h2Class } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { BackLink } from '@/components/ui/back-link'
import { Avatar } from '@/components/ui/avatar'

describe('Page', () => {
  it('wraps the body in the width-capped, padded page column', () => {
    const { container } = render(
      <Page className="gap-4">
        <p>Body</p>
      </Page>,
    )
    const page = container.firstChild
    expect(page).toHaveClass('max-w-[1280px]', 'px-4', 'md:px-20', 'gap-4')
    expect(page).not.toHaveClass('gap-5')
    expect(screen.getByText('Body')).toBeInTheDocument()
  })
})

describe('PageHeader', () => {
  it('renders the title as the page heading', () => {
    render(<PageHeader title="Markets" />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Markets' })
    expect(heading).toHaveClass(...h1Class.split(' '))
  })

  it('shows an optional description and action', () => {
    render(
      <PageHeader
        title="Leaderboard"
        description="Ranked by balance. Ties share a rank."
        action={<button type="button">Create market</button>}
      />,
    )
    expect(screen.getByText('Ranked by balance. Ties share a rank.')).toHaveClass('text-ink2')
    expect(screen.getByRole('button', { name: 'Create market' })).toBeInTheDocument()
  })
})

describe('SectionCard', () => {
  it('is a region named by its heading', () => {
    render(
      <SectionCard title="Outcomes" titleId="outcomes-title">
        <p>Yes</p>
      </SectionCard>,
    )
    const region = screen.getByRole('region', { name: 'Outcomes' })
    expect(region.tagName).toBe('SECTION')
    expect(region).toHaveClass('rounded-card', 'p-[18px]', 'md:p-6', 'gap-3')
    expect(screen.getByRole('heading', { level: 2, name: 'Outcomes' })).toHaveClass(...h2Class.split(' '))
  })

  it('puts the action beside the heading and lets the caller change the gap', () => {
    render(
      <SectionCard title="Outcomes" titleId="outcomes-title" action={<span>80 DC in the pool</span>} className="gap-0">
        <p>Yes</p>
      </SectionCard>,
    )
    const region = screen.getByRole('region', { name: 'Outcomes' })
    expect(region).toHaveClass('gap-0')
    expect(region).not.toHaveClass('gap-3')
    expect(screen.getByText('80 DC in the pool').parentElement).toContainElement(screen.getByRole('heading', { level: 2 }))
  })
})

describe('EmptyState', () => {
  it('shows the icon, title, body and action', () => {
    const { container } = render(
      <EmptyState icon={ChartColumn} title="No markets yet." action={<button type="button">Create market</button>}>
        Open the first one and get the duel started.
      </EmptyState>,
    )
    expect(screen.getByText('No markets yet.')).toHaveClass('font-extrabold')
    expect(screen.getByText('Open the first one and get the duel started.')).toHaveClass('text-sm', 'text-ink2')
    expect(screen.getByRole('button', { name: 'Create market' })).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders just the title when there is no body', () => {
    const { container } = render(<EmptyState icon={ChartColumn} title="Nothing pending." />)
    expect(screen.getByText('Nothing pending.')).toBeInTheDocument()
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })
})

describe('BackLink', () => {
  it('links back with its label as the accessible name', () => {
    const { container } = render(<BackLink href="/markets">Markets</BackLink>)
    const link = screen.getByRole('link', { name: 'Markets' })
    expect(link).toHaveAttribute('href', '/markets')
    expect(link).toHaveClass('min-h-11')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('Avatar', () => {
  it("shows the name's first letter, uppercased, hidden from assistive tech", () => {
    const { container } = render(<Avatar name="  sarah" />)
    const avatar = container.firstChild
    expect(avatar).toHaveTextContent(/^S$/)
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
  })

  it('sizes itself', () => {
    const { container, rerender } = render(<Avatar name="Sarah" />)
    expect(container.firstChild).toHaveClass('size-10', 'bg-acc-soft', 'text-acc-text')
    rerender(<Avatar name="Sarah" size="sm" />)
    expect(container.firstChild).toHaveClass('size-8', 'text-sm')
    rerender(<Avatar name="Sarah" size="lg" />)
    expect(container.firstChild).toHaveClass('size-16', 'md:size-20', 'bg-lime', 'text-on-lime')
  })

  it('falls back to a question mark for a blank name', () => {
    const { container } = render(<Avatar name=" " />)
    expect(container.firstChild).toHaveTextContent('?')
  })
})
