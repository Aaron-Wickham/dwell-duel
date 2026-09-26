// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ChartColumn, Layers } from 'lucide-react'
import { HomeTiles } from '@/components/home/home-tiles'

describe('HomeTiles', () => {
  it('links every tile with its title and subtitle', () => {
    render(
      <HomeTiles
        tiles={[
          { id: 'markets', href: '/markets', icon: ChartColumn, title: 'Markets', subtitle: '3 open markets' },
          { id: 'parlays', href: '/parlays', icon: Layers, title: 'Parlays', subtitle: 'Your slip is empty.' },
        ]}
      />,
    )
    const nav = screen.getByRole('navigation', { name: 'Everything in DwellDuel' })
    const markets = within(nav).getByRole('link', { name: /Markets/ })
    expect(markets).toHaveAttribute('href', '/markets')
    expect(within(markets).getByText('3 open markets')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Parlays/ })).toHaveTextContent('Your slip is empty.')
  })

  it('gives each tile a press state', () => {
    render(<HomeTiles tiles={[{ id: 'markets', href: '/markets', icon: ChartColumn, title: 'Markets', subtitle: '3 open markets' }]} />)
    expect(screen.getByRole('link', { name: /Markets/ })).toHaveClass('pressable')
  })
})
