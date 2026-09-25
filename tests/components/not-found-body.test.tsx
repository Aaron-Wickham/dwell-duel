// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotFoundBody } from '@/components/not-found/not-found-body'

describe('NotFoundBody', () => {
  it('names the page and offers a way back home', () => {
    render(<NotFoundBody />)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByText(/This page wandered off/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back home' })).toHaveAttribute('href', '/')
  })

  it('hides the decorative 404 numeral from assistive tech', () => {
    const { container } = render(<NotFoundBody />)
    const numeral = container.querySelector('[aria-hidden="true"]')
    expect(numeral).toHaveTextContent('404')
  })
})
