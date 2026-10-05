// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { TaskSummary } from '@/lib/tasks/list-tasks'
import type { MyCompletion } from '@/lib/tasks/list-task-completions'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

const { listTasks, listMyTaskCompletions } = vi.hoisted(() => ({ listTasks: vi.fn(), listMyTaskCompletions: vi.fn() }))
vi.mock('@/lib/tasks/list-tasks', () => ({ listTasks }))
vi.mock('@/lib/tasks/list-task-completions', () => ({ listMyTaskCompletions, getMyPendingSentAt: async () => new Map() }))
vi.mock('@/lib/tasks/streaks', () => ({ getMyTaskStreaks: async () => new Map() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase: {}, user: { id: 'p-me' } }) }))
vi.mock('@/components/live/live-tables', () => ({ LiveTables: () => null }))
vi.mock('@/app/(app)/tasks/submit-task-dialog', () => ({ SubmitTaskDialog: () => <button type="button">I did this</button> }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import TasksPage from '@/app/(app)/tasks/page'

const task = (n: number): TaskSummary => ({
  id: `t${n}`,
  title: `Task ${n}`,
  description: null,
  rewardAmount: 10,
  isRepeatable: false,
  period: null,
  isActive: true,
  proofRequired: false,
})
const done = (n: number): MyCompletion => ({ taskId: `t${n}`, status: 'approved', rewardAmount: 10, reviewNote: null, proofCount: 0 })

async function renderTasks(tasks: number, approved: number) {
  listTasks.mockResolvedValue(Array.from({ length: tasks }, (_, i) => task(i + 1)))
  listMyTaskCompletions.mockResolvedValue(Array.from({ length: approved }, (_, i) => done(i + 1)))
  render(await TasksPage())
  return screen.getByRole('region', { name: 'Done' })
}

beforeEach(() => {
  listTasks.mockReset()
  listMyTaskCompletions.mockReset()
})

describe('Tasks’ Done group (#394)', () => {
  it('shows three done tasks and folds the rest behind a native disclosure', async () => {
    const group = await renderTasks(6, 5)
    const disclosure = group.querySelector('details')!
    expect(disclosure).not.toHaveAttribute('open')
    expect(within(disclosure.querySelector('summary')!).getByText('Show all 5 done')).toBeInTheDocument()
    expect([...group.querySelectorAll('li')].filter((li) => !disclosure.contains(li))).toHaveLength(3)
    expect(disclosure.querySelectorAll('li')).toHaveLength(2)
  })

  it('shows three or fewer without a disclosure', async () => {
    const group = await renderTasks(4, 3)
    expect(group.querySelector('details')).toBeNull()
    expect(group.querySelectorAll('li')).toHaveLength(3)
  })
})
