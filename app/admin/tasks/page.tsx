import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listTasks } from '@/lib/tasks/list-tasks'
import { listPendingTaskCompletions } from '@/lib/tasks/list-task-completions'
import { CreateTaskForm } from './create-task-form'
import { EditTaskForm } from './edit-task-form'
import { ReviewButtons } from './review-buttons'

export default async function AdminTasksPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const tasks = await listTasks(supabase)
  const pending = await listPendingTaskCompletions(supabase)

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Tasks</h1>
      <Link href="/admin/members" className="text-sm underline">
        Manage members
      </Link>

      <h2 className="mt-6 text-lg font-semibold">Pending approvals</h2>
      <ul className="mt-2 space-y-3">
        {pending.map((c) => (
          <li key={c.id} className="border p-3">
            <p>
              {c.submitterName} — {c.taskTitle}
            </p>
            <ReviewButtons completionId={c.id} />
          </li>
        ))}
        {pending.length === 0 && <p className="text-sm text-foreground/70">Nothing pending.</p>}
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Catalog</h2>
      <CreateTaskForm />
      <ul className="mt-4 space-y-3">
        {tasks.map((task) => (
          <li key={task.id} className="border p-3">
            <p className="font-medium">
              {task.title} — {task.rewardAmount} DC {!task.isActive && '(inactive)'}
            </p>
            <EditTaskForm task={task} />
          </li>
        ))}
      </ul>
    </div>
  )
}
