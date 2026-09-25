import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { listTasks } from '@/lib/tasks/list-tasks'
import { listMyTaskCompletions } from '@/lib/tasks/list-task-completions'
import { getCurrentPeriodKeys } from '@/lib/tasks/period-keys'
import { SubmitButton } from './submit-button'

const PERIOD_LABEL: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

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
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Tasks</h1>
      <ul className="mt-6 space-y-4">
        {activeTasks.map((task) => {
          const currentPeriodKey = currentPeriodKeys.get(task.period ?? 'once')!
          const active = myCompletions.find(
            (c) => c.taskId === task.id && c.periodKey === currentPeriodKey && c.status !== 'rejected',
          )

          return (
            <li key={task.id} className="border p-4">
              <p className="font-medium">
                {task.title} — {task.rewardAmount} DC
                {task.isRepeatable && ` (${PERIOD_LABEL[task.period!]})`}
              </p>
              {task.description && <p className="text-sm text-foreground/70">{task.description}</p>}
              {!active && <SubmitButton taskId={task.id} />}
              {active?.status === 'pending' && <p className="text-sm text-foreground/70">Pending review</p>}
              {active?.status === 'approved' && <p className="text-sm text-foreground/70">Completed this period</p>}
            </li>
          )
        })}
      </ul>

      <h2 className="mt-8 text-lg font-semibold">My submissions</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {myCompletions.map((c, i) => (
          <li key={i}>
            {allTasks.find((t) => t.id === c.taskId)?.title ?? 'Unknown task'} — {c.status} ({c.rewardAmount} DC)
          </li>
        ))}
      </ul>
    </div>
  )
}
