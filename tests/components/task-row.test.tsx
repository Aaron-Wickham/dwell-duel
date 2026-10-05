// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { TaskRow } from '@/components/tasks/task-row'
import { AGAIN_LABEL } from '@/lib/tasks/period-label'

const NOW = Date.parse('2026-10-04T18:00:00Z')

function renderRow(props: Partial<ComponentProps<typeof TaskRow>> & Pick<ComponentProps<typeof TaskRow>, 'state'>) {
  return render(
    <ul>
      <TaskRow title="Read Genesis 1-3" rewardAmount={10} description={null} cadence="weekly" {...props} />
    </ul>,
  )
}

// The text of the line under the title, as one string (its parts are separate spans).
const metaLine = (text: string) => (_: string, element: Element | null) => element?.tagName === 'P' && element.textContent === text

describe('TaskRow', () => {
  it('leads a task to do with the reward in gold, then the cadence, and renders the action', () => {
    renderRow({ state: { kind: 'todo' }, description: 'The creation account and the fall.', action: <button type="button">I did this</button> })
    expect(screen.getByText('Read Genesis 1-3')).toBeInTheDocument()
    expect(screen.getByText(metaLine('10 DC · weekly'))).toBeInTheDocument()
    expect(screen.getByText('10 DC')).toHaveClass('text-gold')
    expect(screen.getByText('The creation account and the fall.')).toHaveClass('line-clamp-1')
    expect(screen.getByRole('button', { name: 'I did this' })).toBeInTheDocument()
  })

  it('says "once" for a one-off task, and carries no chips (#394)', () => {
    const { container } = renderRow({ state: { kind: 'todo' }, cadence: 'once' })
    expect(screen.getByText(metaLine('10 DC · once'))).toBeInTheDocument()
    expect(container.querySelector('.rounded-full')).toBeNull()
  })

  it('is a divided row, not a card', () => {
    const { container } = renderRow({ state: { kind: 'todo' } })
    const row = container.querySelector('li')
    expect(row).toHaveClass('py-3.5')
    expect(row).not.toHaveClass('border', 'rounded-tile', 'pressable')
  })

  it('says when proof is needed, in words', () => {
    renderRow({ state: { kind: 'todo' }, proofRequired: true })
    expect(screen.getByText('Photo, file or link needed')).toBeInTheDocument()
  })

  it('shows a streak of two periods or more beside the cadence, and none for a single period', () => {
    const { unmount } = renderRow({ state: { kind: 'todo' }, streak: { period: 'weekly', count: 3 } })
    expect(screen.getByText(metaLine('10 DC · weekly · 3-week streak'))).toBeInTheDocument()
    unmount()
    renderRow({ state: { kind: 'todo' }, streak: { period: 'weekly', count: 1 } })
    expect(screen.queryByText(/streak/)).toBeNull()
  })

  it('says when a waiting submission was sent and with how many attachments, with no action', () => {
    renderRow({
      state: { kind: 'waiting', sentAt: '2026-10-01T12:00:00Z', now: NOW, proofCount: 1 },
      action: <button type="button">I did this</button>,
    })
    expect(screen.getByText(metaLine('10 DC · sent Thu · 1 attachment'))).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the reviewer’s reason in loss tone beside the action when a submission was turned down', () => {
    renderRow({ state: { kind: 'rejected', note: 'Please write a full paragraph.' }, action: <button type="button">Try again</button> })
    expect(screen.getByText('“Please write a full paragraph.”')).toHaveClass('text-loss')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('still says something when the reviewer gave no reason (#200)', () => {
    renderRow({ state: { kind: 'rejected', note: null }, action: <button type="button">Try again</button> })
    expect(screen.getByText('No reason given.')).toHaveClass('text-loss')
  })

  it('shows a done task as a quiet line with its reward, streak and when it opens again (#266)', () => {
    const { container } = renderRow({
      state: { kind: 'done', again: AGAIN_LABEL.weekly },
      streak: { period: 'weekly', count: 3 },
      action: <button type="button">I did this</button>,
    })
    expect(screen.getByText('Read Genesis 1-3 · 10 DC')).toBeInTheDocument()
    expect(screen.getByText('3-week streak · Again Monday, midnight ET')).toBeInTheDocument()
    expect(container.querySelector('li')).toHaveClass('text-ink2')
    expect(container.querySelector('svg')).toHaveClass('text-win')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('gives a done one-off task no second line', () => {
    const { container } = renderRow({ state: { kind: 'done', again: null }, cadence: 'once' })
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })
})
