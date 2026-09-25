// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LeaderboardRow } from '@/components/leaderboard/leaderboard-row'

describe('LeaderboardRow', () => {
  it('links the name to the member profile and shows the balance', () => {
    render(
      <ol>
        <LeaderboardRow rank={2} name="Bob" balance={90} isMe={false} href="/members/bob" />
      </ol>,
    )
    const link = screen.getByRole('link', { name: 'Bob' })
    expect(link).toHaveAttribute('href', '/members/bob')
    expect(screen.getByText('90 DC')).toBeInTheDocument()
  })

  it('gives rank 1 the top style, aria-labelled with the rank', () => {
    render(
      <ol>
        <LeaderboardRow rank={1} name="Sarah" balance={245} isMe={false} href="/members/sarah" />
      </ol>,
    )
    expect(screen.getByLabelText('Rank 1')).toHaveClass('bg-lime', 'text-on-lime')
  })

  it('does not use the top style for lower ranks', () => {
    render(
      <ol>
        <LeaderboardRow rank={3} name="Aaron" balance={120} isMe={false} href="/members/aaron" />
      </ol>,
    )
    expect(screen.getByLabelText('Rank 3')).not.toHaveClass('bg-lime')
  })

  it("marks the viewer's own row with (you), outside the link's accessible name", () => {
    render(
      <ol>
        <LeaderboardRow rank={3} name="Aaron" balance={120} isMe={true} href="/members/aaron" />
      </ol>,
    )
    expect(screen.getByRole('link', { name: 'Aaron' })).toBeInTheDocument()
    expect(screen.getByText('(you)', { exact: false })).toBeInTheDocument()
  })
})
