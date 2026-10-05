// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LeaderboardRow } from '@/components/leaderboard/leaderboard-row'

describe('LeaderboardRow', () => {
  it('links the name to the member profile and shows the score', () => {
    render(
      <ol>
        <LeaderboardRow rank={2} name="Bob" score={90} isMe={false} href="/members/bob" />
      </ol>,
    )
    const link = screen.getByRole('link', { name: 'Bob' })
    expect(link).toHaveAttribute('href', '/members/bob')
    // The column shows the bare figure (#396); the unit is for a screen reader.
    expect(screen.getByRole('listitem')).toHaveTextContent(/Bob90 DC$/)
    expect(screen.getByText('DC', { exact: false })).toHaveClass('sr-only')
  })

  // #396: at 375px the rank tile, avatar, chip and score left the name ~50px, broken a letter a line.
  it('keeps a long name on one line, truncated, with the record chip left out on a phone', () => {
    render(
      <ol>
        <LeaderboardRow
          rank={12}
          name="Bartholomew Montgomery-Fitzwilliam"
          score={5353}
          record={{ won: 4, lost: 3 }}
          isMe={false}
          href="/members/b"
        />
      </ol>,
    )
    const link = screen.getByRole('link', { name: 'Bartholomew Montgomery-Fitzwilliam' })
    expect(link).toHaveClass('truncate', 'min-w-0')
    expect(link).not.toHaveClass('break-words')
    expect(link.parentElement).toHaveClass('min-w-0', 'grow')
    expect(screen.getByText('5,353')).toHaveClass('shrink-0', 'whitespace-nowrap')
    expect(screen.getByText('4 won, 3 lost').closest('span.hidden')).toHaveClass('md:inline-flex')
  })

  it('gives rank 1 the top style, announced as Rank 1', () => {
    render(
      <ol>
        <LeaderboardRow rank={1} name="Sarah" score={245} isMe={false} href="/members/sarah" />
      </ol>,
    )
    expect(screen.getByText('Rank 1')).toHaveClass('sr-only')
    expect(screen.getByText('Rank 1').parentElement).toHaveClass('bg-lime', 'text-on-lime')
  })

  it('does not use the top style for lower ranks', () => {
    render(
      <ol>
        <LeaderboardRow rank={3} name="Aaron" score={120} isMe={false} href="/members/aaron" />
      </ol>,
    )
    expect(screen.getByText('Rank 3').parentElement).not.toHaveClass('bg-lime')
  })

  it("marks the viewer's own row with (you), outside the link's accessible name", () => {
    render(
      <ol>
        <LeaderboardRow rank={3} name="Aaron" score={120} isMe={true} href="/members/aaron" />
      </ol>,
    )
    expect(screen.getByRole('link', { name: 'Aaron' })).toBeInTheDocument()
    expect(screen.getByText('(you)', { exact: false })).toBeInTheDocument()
  })

  it('stretches the name link over the row, which presses as one', () => {
    render(
      <ol>
        <LeaderboardRow rank={2} name="Bob" score={90} isMe={false} href="/members/bob" />
      </ol>,
    )
    expect(screen.getByRole('link', { name: 'Bob' })).toHaveClass('stretched-link')
    expect(screen.getByRole('listitem')).toHaveClass('pressable', 'relative')
  })

  it('is a focus target named from its rank, name and score when given a DOM id', () => {
    render(
      <ol>
        <LeaderboardRow rank={2} name="Bob" score={90} isMe={false} href="/members/bob" domId="member-bob" />
      </ol>,
    )
    const row = screen.getByRole('listitem', { name: /Rank 2.*Bob.*90.*DC/ })
    expect(row).toHaveAttribute('id', 'member-bob')
    expect(row).toHaveAttribute('tabindex', '-1')
  })
})

describe('LeaderboardRow on the month board', () => {
  it.each([
    [140, '+140'],
    [-25, '−25'],
    [0, '0'],
  ])('shows a profit of %i as %s', (score, text) => {
    render(
      <ol>
        <LeaderboardRow rank={1} name="Bob" score={score} signed isMe={false} href="/members/bob" />
      </ol>,
    )
    expect(screen.getByRole('listitem')).toHaveTextContent(new RegExp(`Bob${text.replace('+', '\\+')} DC$`))
  })
})
