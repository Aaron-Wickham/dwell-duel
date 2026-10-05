// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeedItem } from '@/components/feed/feed-item'

describe('FeedItem', () => {
  it('renders a segment sentence with a linked actor and market, plus the relative age', () => {
    render(
      <ul>
        <FeedItem
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

  // A11Y-06: the names are the row's only tap targets (#187), so each reaches 44px tall; the row
  // itself never presses.
  it('gives every link a 44px hit area and leaves the row unpressable', () => {
    render(
      <ul>
        <FeedItem segments={[{ text: 'Alice', href: '/members/1' }, ' created ', { text: 'Will it rain?', href: '/markets/2' }]} age="5m ago" />
      </ul>,
    )
    for (const link of screen.getAllByRole('link')) expect(link).toHaveClass('hit-area')
    expect(screen.getByRole('listitem')).not.toHaveClass('pressable')
  })

  it('only links the segments that have an href', () => {
    render(
      <ul>
        <FeedItem segments={[{ text: 'Will it rain?', href: '/markets/2' }, ' resolved Yes']} age="1h ago" />
      </ul>,
    )
    expect(screen.getByRole('listitem')).toHaveTextContent('Will it rain? resolved Yes')
    expect(screen.queryAllByRole('link')).toHaveLength(1)
  })

  // #395: ReactionBar's React goes under the age in row 2, beside the sentence spanning rows 1-2, so
  // a row nobody reacted to is its sentence and age alone.
  it('lays the sentence beside the age, leaving the cell under the age for React', () => {
    render(
      <ul>
        <FeedItem segments={['Alice bet 5 DC on Yes']} age="5m ago" />
      </ul>,
    )
    expect(screen.getByText('Alice bet 5 DC on Yes').closest('div')).toHaveClass('col-start-1', 'row-start-1', 'row-span-2')
    expect(screen.getByText('5m ago')).toHaveClass('col-start-2', 'row-start-1')
  })

  // #387: the tile only named the kind the sentence already says.
  it('starts with the sentence, no icon tile', () => {
    const { container } = render(
      <ul>
        <FeedItem segments={['x']} age="1h ago" />
      </ul>,
    )
    expect(container.querySelector('svg')).toBeNull()
  })

  it('names a focusable row by its sentence alone once it carries reaction buttons', () => {
    render(
      <ul>
        <FeedItem
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
