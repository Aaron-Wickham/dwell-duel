// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Target, Trophy } from 'lucide-react'
import { FeedItem } from '@/components/feed/feed-item'

describe('FeedItem', () => {
  it('renders a segment sentence with a linked actor and market, plus the relative age', () => {
    render(
      <ul>
        <FeedItem
          icon={Target}
          segments={[{ text: 'Alice', href: '/members/1' }, ' bet 5 DC on Yes in ', { text: 'Social layer market', href: '/markets/2' }]}
          age="5m ago"
        />
      </ul>,
    )
    const item = screen.getByRole('listitem')
    expect(item).toHaveTextContent('Alice bet 5 DC on Yes in Social layer market')
    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/members/1')
    expect(screen.getByRole('link', { name: 'Social layer market' })).toHaveAttribute('href', '/markets/2')
    expect(screen.getByText('5m ago')).toBeInTheDocument()
  })

  it('only links the segments that have an href', () => {
    render(
      <ul>
        <FeedItem icon={Trophy} segments={[{ text: 'Will it rain?', href: '/markets/2' }, ' resolved: Yes']} age="1h ago" />
      </ul>,
    )
    expect(screen.getByRole('listitem')).toHaveTextContent('Will it rain? resolved: Yes')
    expect(screen.queryAllByRole('link')).toHaveLength(1)
  })

  it('hides the icon from assistive tech', () => {
    const { container } = render(
      <ul>
        <FeedItem icon={Target} segments={['x']} age="1h ago" />
      </ul>,
    )
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('names a focusable row by its sentence alone once it carries reaction buttons', () => {
    render(
      <ul>
        <FeedItem
          icon={Target}
          segments={['Alice bet 5 DC on Yes']}
          age="1h ago"
          domId="feed-bet_003a1"
          reactions={<button type="button" aria-label="React fire, 0 reactions" />}
        />
      </ul>,
    )
    const item = screen.getByRole('listitem')
    expect(item).toHaveAttribute('aria-labelledby', 'feed-bet_003a1-label')
    expect(item).toHaveAccessibleName('Alice bet 5 DC on Yes')
    expect(screen.getByRole('button', { name: 'React fire, 0 reactions' })).toBeInTheDocument()
  })
})
