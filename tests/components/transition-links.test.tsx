// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { Target } from 'lucide-react'

// Vitest resolves next/link to the Pages Router Link, which drops transitionTypes before the DOM,
// so the prop is written onto the anchor for these assertions.
vi.mock('next/link', () => ({
  default: ({ transitionTypes, href, ...props }: ComponentProps<'a'> & { href: string; transitionTypes?: string[] }) => (
    <a href={href} data-transition-types={transitionTypes?.join(' ')} {...props} />
  ),
}))
vi.mock('@/components/markets/probability-chart', () => ({ ProbabilityChart: () => null }))

import { BackLink } from '@/components/ui/back-link'
import { MarketCard } from '@/components/markets/market-card'
import { LeaderboardRow } from '@/components/leaderboard/leaderboard-row'
import { FeedItem } from '@/components/feed/feed-item'
import { HomeTiles } from '@/components/home/home-tiles'

const types = (name: string | RegExp) => screen.getByRole('link', { name }).getAttribute('data-transition-types')

describe('transition types on links', () => {
  it('tags the back link nav-back', () => {
    render(<BackLink href="/markets">Markets</BackLink>)
    expect(types('Markets')).toBe('nav-back')
  })

  it('tags links into a market or a member nav-forward', () => {
    render(
      <>
        <MarketCard
          id="m1"
          title="Will it rain?"
          status="open"
          kind="binary"
          closeAt="2026-10-04T16:30:00.000Z"
          resolvedAt={null}
          outcomes={[]}
          resolvedOutcomeLabel={null}
        />
        <ol>
          <LeaderboardRow rank={1} name="Bob" score={120} isMe={false} href="/members/b" />
        </ol>
        <ul>
          <FeedItem icon={Target} segments={[{ text: 'Carol', href: '/members/c' }]} age="1m ago" />
        </ul>
      </>,
    )
    expect(types('Will it rain?')).toBe('nav-forward')
    expect(types('Bob')).toBe('nav-forward')
    expect(types('Carol')).toBe('nav-forward')
  })

  it('slides into Admin from Home, and leaves tab tiles to the crossfade', () => {
    render(
      <HomeTiles
        tiles={[
          { id: 'markets', href: '/markets', icon: Target, title: 'Markets', subtitle: '2 open' },
          { id: 'admin', href: '/admin/invites', icon: Target, title: 'Admin', subtitle: 'All clear' },
        ]}
      />,
    )
    expect(types(/^Admin/)).toBe('nav-forward')
    expect(types(/^Markets/)).toBeNull()
  })
})
