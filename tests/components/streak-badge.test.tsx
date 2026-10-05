// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StreakBadge } from '@/components/tasks/streak-badge'
import { TaskRow } from '@/components/tasks/task-row'

describe('StreakBadge', () => {
  it('reads "5-week streak", in words with no emoji (#387)', () => {
    const { container } = render(<StreakBadge period="weekly" count={5} />)
    expect(screen.getByText('5-week streak')).toBeInTheDocument()
    expect(container).toHaveTextContent(/^5-week streak$/)
  })

  it.each([
    ['daily', 2, '2-day streak'],
    ['monthly', 3, '3-month streak'],
    ['yearly', 4, '4-year streak'],
  ] as const)('words a %s streak of %i as "%s"', (period, count, text) => {
    render(<StreakBadge period={period} count={count} />)
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('shows nothing below two periods', () => {
    const { container } = render(<StreakBadge period="daily" count={1} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('TaskRow streak', () => {
  it('shows the streak beside the cadence', () => {
    render(
      <ul>
        <TaskRow
          title="Morning devotional"
          rewardAmount={5}
          description={null}
          cadence="Daily"
          streak={{ period: 'daily', count: 6 }}
          state={{ kind: 'approved' }}
        />
      </ul>,
    )
    expect(screen.getByText('Daily')).toBeInTheDocument()
    expect(screen.getByText('6-day streak')).toBeInTheDocument()
  })

  it('shows no streak, and no empty pill line, for a single period', () => {
    const { container } = render(
      <ul>
        <TaskRow title="Morning devotional" rewardAmount={5} description={null} streak={{ period: 'daily', count: 1 }} state={{ kind: 'approved' }} />
      </ul>,
    )
    expect(screen.queryByText(/streak/)).toBeNull()
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })
})
