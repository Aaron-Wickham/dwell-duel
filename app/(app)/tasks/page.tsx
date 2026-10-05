import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { renderStamp } from '@/lib/live/render-stamp'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listTasks, type TaskSummary } from '@/lib/tasks/list-tasks'
import { getMyPendingSentAt, listMyTaskCompletions } from '@/lib/tasks/list-task-completions'
import { getMyTaskStreaks } from '@/lib/tasks/streaks'
import { Page, PageHeader } from '@/components/ui/page'
import { ListSection } from '@/components/ui/list-section'
import { EmptyState } from '@/components/ui/empty-state'
import { dividedRowsClass } from '@/components/ui/list-card'
import { TaskRow, type TaskRowState } from '@/components/tasks/task-row'
import { AGAIN_LABEL, cadenceWord } from '@/lib/tasks/period-label'
import { SubmitTaskDialog } from './submit-task-dialog'

type Group = 'todo' | 'waiting' | 'rejected' | 'done'

const GROUP_TITLES: Record<Group, string> = {
  todo: 'To do',
  waiting: 'Waiting for review',
  rejected: 'Not approved',
  done: 'Done',
}

// One group of tasks under its visible heading, shown only when it has rows.
function TaskGroup({ group, rows }: { group: Group; rows: ReactNode[] }) {
  if (rows.length === 0) return null
  return (
    <ListSection title={GROUP_TITLES[group]} titleId={`tasks-${group}`} className="gap-1">
      <ul className={dividedRowsClass}>{rows}</ul>
    </ListSection>
  )
}

function streakOf(task: TaskSummary, streaks: Map<string, number>) {
  return task.period ? { period: task.period, count: streaks.get(task.id) ?? 0 } : null
}

export default async function TasksPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const [allTasks, myCompletions, sentAt, streaks] = await Promise.all([
    listTasks(supabase),
    listMyTaskCompletions(supabase),
    getMyPendingSentAt(supabase, user.id),
    getMyTaskStreaks(supabase),
  ])
  const activeTasks = allTasks.filter((t) => t.isActive)
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  // Grouped by what you can do with each (#394), in catalogue order within a group.
  const groups: Record<Group, ReactNode[]> = { todo: [], waiting: [], rejected: [], done: [] }
  for (const task of activeTasks) {
    const current = myCompletions.find((c) => c.taskId === task.id)
    const [group, state]: [Group, TaskRowState] =
      current?.status === 'pending'
        ? ['waiting', { kind: 'waiting', sentAt: sentAt.get(task.id) ?? null, now, proofCount: current.proofCount }]
        : current?.status === 'approved'
          ? ['done', { kind: 'done', again: task.isRepeatable && task.period ? AGAIN_LABEL[task.period] : null }]
          : current?.status === 'rejected'
            ? ['rejected', { kind: 'rejected', note: current.reviewNote }]
            : ['todo', { kind: 'todo' }]
    const canSubmit = group === 'todo' || group === 'rejected'
    groups[group].push(
      <TaskRow
        key={task.id}
        title={task.title}
        rewardAmount={task.rewardAmount}
        description={task.description}
        cadence={cadenceWord(task)}
        streak={streakOf(task, streaks)}
        state={state}
        proofRequired={task.proofRequired}
        action={
          canSubmit && (
            <SubmitTaskDialog
              taskId={task.id}
              taskTitle={task.title}
              memberId={user.id}
              proofRequired={task.proofRequired}
              label={group === 'rejected' ? 'Try again' : 'I did this'}
            />
          )
        }
      />,
    )
  }
  const hasSide = groups.waiting.length + groups.rejected.length + groups.done.length > 0

  return (
    <Page transition="tab">
      <PageHeader title="Tasks" description="Earn DC with Bible study. A reviewer checks each one." />
      <LiveTables subscriptions={pageSubscriptions.tasks(user.id)} renderedAt={renderStamp()} />
      {activeTasks.length === 0 ? (
        <EmptyState title="No tasks yet.">Admins add Bible-study tasks here.</EmptyState>
      ) : (
        // To do (7fr) beside what's waiting, turned down and done (5fr) from lg.
        <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
          <TaskGroup group="todo" rows={groups.todo} />
          {hasSide && (
            <div className="flex flex-col gap-7">
              <TaskGroup group="waiting" rows={groups.waiting} />
              <TaskGroup group="rejected" rows={groups.rejected} />
              <TaskGroup group="done" rows={groups.done} />
            </div>
          )}
        </div>
      )}
    </Page>
  )
}
