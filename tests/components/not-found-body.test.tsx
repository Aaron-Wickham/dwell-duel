// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotFoundBody } from '@/components/not-found/not-found-body'

describe('NotFoundBody', () => {
  it('names the page and offers a way back home', () => {
    render(<NotFoundBody />)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByText('The link may be old, or what it pointed to was removed.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/')
  })

  // #387: the giant numeral was decoration that pushed the words down.
  it('draws no 404 numeral', () => {
    const { container } = render(<NotFoundBody />)
    expect(container).not.toHaveTextContent('404')
  })
})
