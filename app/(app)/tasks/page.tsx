import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { renderStamp } from '@/lib/live/render-stamp'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listTasks, type TaskSummary } from '@/lib/tasks/list-tasks'
import { getMyPendingSentAt, listMyTaskCompletions } from '@/lib/tasks/list-task-completions'
import { getMyTaskStreaks } from '@/lib/tasks/streaks'
import { atLeast, getRole } from '@/lib/auth/roles'
import { Page, PageHeader } from '@/components/ui/page'
import { buttonVariants } from '@/components/ui/button'
import { IntentLink } from '@/components/ui/intent-link'
import { TAB_TRANSITION } from '@/components/nav/page-transition'
import { ListSection } from '@/components/ui/list-section'
import { EmptyState } from '@/components/ui/empty-state'
import { dividedRowsClass } from '@/components/ui/list-card'
import { TaskRow, type TaskRowState } from '@/components/tasks/task-row'
import { AGAIN_LABEL, cadenceWord } from '@/lib/tasks/period-label'
import { cn } from '@/lib/utils'
import { SubmitTaskDialog } from './submit-task-dialog'

export const metadata: Metadata = { title: 'Tasks' }

type Group = 'todo' | 'waiting' | 'rejected' | 'done'

const GROUP_TITLES: Record<Group, string> = {
  todo: 'To do',
  waiting: 'Waiting for review',
  rejected: 'Not approved',
  done: 'Done',
}

// Done shows this many; the rest wait behind a native disclosure (#394).
const DONE_SHOWN = 3

// The order AGAIN_LABEL's periods come round in, soonest first.
const PERIOD_ORDER: NonNullable<TaskSummary['period']>[] = ['daily', 'weekly', 'monthly', 'yearly']

// One group of tasks under its visible heading, shown only when it has rows, or when `empty` says
// what an empty one means.
function TaskGroup({ group, rows, empty }: { group: Group; rows: ReactNode[]; empty?: ReactNode }) {
  if (rows.length === 0) {
    if (!empty) return null
    return (
      <ListSection title={GROUP_TITLES[group]} titleId={`tasks-${group}`} className="gap-1">
        {empty}
      </ListSection>
    )
  }
  const folded = group === 'done' && rows.length > DONE_SHOWN
  return (
    <ListSection title={GROUP_TITLES[group]} titleId={`tasks-${group}`} className="gap-1">
      <ul className={dividedRowsClass}>{folded ? rows.slice(0, DONE_SHOWN) : rows}</ul>
      {folded && (
        <details className="group border-t border-line">
          {/* flex drops the browser's disclosure marker, so the chevron says this opens. */}
          <summary className="pressable flex min-h-11 cursor-pointer items-center gap-2 font-bold">
            <span className="group-open:hidden">Show all {rows.length} done</span>
            <span className="hidden group-open:inline">Show fewer</span>
            <ChevronDown
              aria-hidden="true"
              className="size-5 shrink-0 text-ink2 transition-transform duration-(--duration-fast) group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <ul className={dividedRowsClass}>{rows.slice(DONE_SHOWN)}</ul>
        </details>
      )}
    </ListSection>
  )
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
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
  const reopening = new Set<NonNullable<TaskSummary['period']>>()
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
    if (group === 'done' && task.isRepeatable && task.period) reopening.add(task.period)
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
              description={task.description}
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
  // Everything waiting or done: To do still says so, and when the soonest one opens again. A task
  // to try again is something to do, so then Not approved leads instead.
  const soonest = PERIOD_ORDER.find((p) => reopening.has(p))
  const todoEmpty =
    groups.rejected.length === 0 ? (
      <EmptyState title="Nothing to do right now.">{soonest ? `A task opens ${lowerFirst(AGAIN_LABEL[soonest])}.` : null}</EmptyState>
    ) : undefined
  const canManage = activeTasks.length === 0 && atLeast(await getRole(supabase), 'admin')

  return (
    <Page transition="tab">
      <PageHeader title="Tasks" description="Earn DC with Bible study. A reviewer checks each one." />
      <LiveTables subscriptions={pageSubscriptions.tasks(user.id)} renderedAt={renderStamp()} />
      {activeTasks.length === 0 ? (
        <EmptyState
          title="No tasks yet."
          action={
            canManage && (
              <IntentLink
                href="/admin/tasks"
                transitionTypes={TAB_TRANSITION}
                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start no-underline')}
              >
                Add a task
              </IntentLink>
            )
          }
        >
          Admins add Bible-study tasks here.
        </EmptyState>
      ) : (
        // To do (7fr) beside what's waiting, turned down and done (5fr) from lg; alone, To do takes the column.
        <div className={cn('flex flex-col gap-7', hasSide && 'lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start')}>
          <TaskGroup group="todo" rows={groups.todo} empty={todoEmpty} />
          {hasSide && (
            // Not approved first: it's the one with something to do (TSK-11).
            <div className="flex flex-col gap-7">
              <TaskGroup group="rejected" rows={groups.rejected} />
              <TaskGroup group="waiting" rows={groups.waiting} />
              <TaskGroup group="done" rows={groups.done} />
            </div>
          )}
        </div>
      )}
    </Page>
  )
}
