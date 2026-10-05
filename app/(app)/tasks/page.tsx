import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { renderStamp } from '@/lib/live/render-stamp'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listTasks } from '@/lib/tasks/list-tasks'
import { listMyTaskCompletions } from '@/lib/tasks/list-task-completions'
import { getMyTaskStreaks } from '@/lib/tasks/streaks'
import { Page, PageHeader } from '@/components/ui/page'
import { ListSection } from '@/components/ui/list-section'
import { EmptyState } from '@/components/ui/empty-state'
import { listCardsClass } from '@/components/ui/list-card'
import { cn } from '@/lib/utils'
import { TaskRow, type TaskRowState } from '@/components/tasks/task-row'
import { AGAIN_LABEL, PERIOD_LABEL } from '@/lib/tasks/period-label'
import { SubmitTaskDialog } from './submit-task-dialog'

export default async function TasksPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const [allTasks, myCompletions, streaks] = await Promise.all([
    listTasks(supabase),
    listMyTaskCompletions(supabase),
    getMyTaskStreaks(supabase),
  ])
  const activeTasks = allTasks.filter((t) => t.isActive)

  return (
    <Page transition="tab">
      <PageHeader title="Tasks" description="Earn DC with Bible study. A reviewer checks each one before the coins land." />
      <LiveTables subscriptions={pageSubscriptions.tasks(user.id)} renderedAt={renderStamp()} />
      {activeTasks.length === 0 ? (
        <EmptyState title="No tasks yet.">
          Admins add Bible-study tasks here.
        </EmptyState>
      ) : (
        // The page's only content, so its cards sit on the page (D2); "Tasks" already names it.
        <ListSection title="Task catalog" titleId="task-catalog" titleHidden>
          <ul className={cn(listCardsClass, 'lg:grid lg:grid-cols-2 lg:gap-5')}>
            {activeTasks.map((task) => {
              const current = myCompletions.find((c) => c.taskId === task.id)
              const state: TaskRowState =
                current?.status === 'pending'
                  ? { kind: 'pending', proofCount: current.proofCount }
                  : current?.status === 'approved'
                    ? { kind: 'approved', again: task.isRepeatable && task.period ? AGAIN_LABEL[task.period] : null }
                    : { kind: 'available', rejection: current?.status === 'rejected' ? { note: current.reviewNote } : null }

              return (
                <TaskRow
                  key={task.id}
                  title={task.title}
                  rewardAmount={task.rewardAmount}
                  description={task.description}
                  cadence={task.isRepeatable ? PERIOD_LABEL[task.period!] : null}
                  streak={task.period ? { period: task.period, count: streaks.get(task.id) ?? 0 } : null}
                  state={state}
                  proofRequired={task.proofRequired}
                  action={<SubmitTaskDialog taskId={task.id} taskTitle={task.title} memberId={user.id} proofRequired={task.proofRequired} />}
                />
              )
            })}
          </ul>
        </ListSection>
      )}
    </Page>
  )
}
