// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TaskRow } from '@/components/tasks/task-row'

describe('TaskRow', () => {
  it('joins the title and reward in one element, and renders the action when available', () => {
    render(
      <ul>
        <TaskRow
          title="Read Genesis 1-3"
          rewardAmount={10}
          description="The creation account and the fall."
          cadence={null}
          state={{ kind: 'available' }}
          action={<button type="button">I did this</button>}
        />
      </ul>,
    )
    // The reward is its own <span>, so the whole string is only the <p>'s combined text (Testing Library's
    // string matchers read an element's own text nodes only; Playwright's getByText reads descendants too).
    expect(
      screen.getAllByText((_, element) => element?.tagName === 'P' && element.textContent === 'Read Genesis 1-3 — 10 DC'),
    ).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'I did this' })).toBeInTheDocument()
  })

  it('shows a pending chip instead of the action', () => {
    render(
      <ul>
        <TaskRow
          title="Memorize Psalm 23"
          rewardAmount={25}
          description={null}
          cadence={null}
          state={{ kind: 'pending' }}
          action={<button type="button">I did this</button>}
        />
      </ul>,
    )
    expect(screen.getByText('Pending review')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'I did this' })).toBeNull()
  })

  it('shows an approved chip', () => {
    render(
      <ul>
        <TaskRow
          title="Read the Sermon on the Mount"
          rewardAmount={15}
          description={null}
          cadence={null}
          state={{ kind: 'approved' }}
        />
      </ul>,
    )
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('shows the rejection note beside the action when the latest submission was turned down', () => {
    render(
      <ul>
        <TaskRow
          title="Journal on Sunday’s sermon"
          rewardAmount={5}
          description={null}
          cadence="Weekly"
          state={{ kind: 'available', rejectionNote: 'Please write a full paragraph.' }}
          action={<button type="button">I did this</button>}
        />
      </ul>,
    )
    expect(screen.getByRole('button', { name: 'I did this' })).toBeInTheDocument()
    expect(screen.getByText(/Please write a full paragraph\./)).toBeInTheDocument()
  })

  it('shows the cadence as a pill for a repeatable task', () => {
    render(
      <ul>
        <TaskRow
          title="Journal on Sunday’s sermon"
          rewardAmount={5}
          description="A paragraph on what stuck with you."
          cadence="Weekly"
          state={{ kind: 'available' }}
        />
      </ul>,
    )
    expect(screen.getByText('Weekly')).toBeInTheDocument()
  })

  it('shows no pill for a one-off task', () => {
    render(
      <ul>
        <TaskRow title="Read Genesis 1-3" rewardAmount={10} description={null} cadence={null} state={{ kind: 'available' }} />
      </ul>,
    )
    expect(screen.queryByText('Weekly')).toBeNull()
  })
})
