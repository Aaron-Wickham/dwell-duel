import { redirect } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { listTasks } from '@/lib/tasks/list-tasks'
import { listMyTaskCompletions } from '@/lib/tasks/list-task-completions'
import { getCurrentPeriodKeys } from '@/lib/tasks/period-keys'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { TaskRow, type TaskRowState } from '@/components/tasks/task-row'
import { PERIOD_LABEL } from '@/lib/tasks/period-label'
import { SubmitButton } from './submit-button'

export default async function TasksPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const allTasks = await listTasks(supabase)
  const activeTasks = allTasks.filter((t) => t.isActive)
  const myCompletions = await listMyTaskCompletions(supabase, user.id)
  const currentPeriodKeys = await getCurrentPeriodKeys(
    supabase,
    activeTasks.map((t) => t.period),
  )

  return (
    <Page transition="tab">
      <PageHeader title="Tasks" description="Earn DC with Bible study. An admin reviews each one before the coins land." />
      {activeTasks.length === 0 ? (
        <EmptyState icon={BookOpen} title="No tasks yet.">
          Admins add Bible-study tasks here.
        </EmptyState>
      ) : (
        <SectionCard title={<span className="sr-only">Task catalog</span>} titleId="task-catalog" className="gap-0 p-0 md:p-0">
          <ul className="flex flex-col divide-y divide-line px-[18px] md:px-6">
            {activeTasks.map((task) => {
              const periodKey = currentPeriodKeys.get(task.period ?? 'once')!
              const current = myCompletions.find((c) => c.taskId === task.id && c.periodKey === periodKey)
              const state: TaskRowState =
                current?.status === 'pending'
                  ? { kind: 'pending' }
                  : current?.status === 'approved'
                    ? { kind: 'approved' }
                    : { kind: 'available', rejectionNote: current?.status === 'rejected' ? current.reviewNote : null }

              return (
                <TaskRow
                  key={task.id}
                  title={task.title}
                  rewardAmount={task.rewardAmount}
                  description={task.description}
                  cadence={task.isRepeatable ? PERIOD_LABEL[task.period!] : null}
                  state={state}
                  action={<SubmitButton taskId={task.id} />}
                />
              )
            })}
          </ul>
        </SectionCard>
      )}
    </Page>
  )
}
