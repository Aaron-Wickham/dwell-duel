import { redirect } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { atLeast, getRole } from '@/lib/auth/roles'
import { listTasks } from '@/lib/tasks/list-tasks'
import { listPendingTaskCompletions } from '@/lib/tasks/list-task-completions'
import { ageLabel } from '@/lib/social/relative-time'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { ContentReveal } from '@/components/nav/page-transition'
import { CreateTaskForm } from './create-task-form'
import { PendingApprovals } from './pending-approvals'
import { TaskCatalogItem } from './task-catalog-item'

export default async function AdminTasksPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  const role = await getRole(supabase)
  if (!atLeast(role, 'reviewer')) redirect('/')
  const canManage = atLeast(role, 'admin')

  const [tasks, pendingRaw] = await Promise.all([
    canManage ? listTasks(supabase) : Promise.resolve([]),
    listPendingTaskCompletions(supabase),
  ])
  // Ages are worked out here, on the server, so the client-rendered list hydrates with the same text.
  const pending = pendingRaw.map((c) => ({ ...c, submittedAge: ageLabel(c.submittedAt) }))

  return (
    <ContentReveal>
      <div className="flex flex-col gap-5 md:gap-7">
        <LiveTables subscriptions={pageSubscriptions.adminTasks()} />
        <SectionCard
          title="Pending approvals"
          titleId="pending-approvals"
          className="gap-4"
          action={pending.length > 0 ? <span className="text-sm text-ink2">{pending.length} waiting</span> : undefined}
        >
          <PendingApprovals pending={pending} viewerId={user.id} />
        </SectionCard>
        {/* Reviewers only review; creating and editing tasks is for admins. */}
        {canManage && (
          <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-7">
            <SectionCard title="Create task" titleId="create-task" className="gap-4">
              <CreateTaskForm />
            </SectionCard>
            <SectionCard title="Task catalog" titleId="task-catalog" className="gap-1">
              {tasks.length === 0 ? (
                <EmptyState icon={BookOpen} title="No tasks yet." />
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {tasks.map((task) => (
                    <TaskCatalogItem key={task.id} task={task} canDelete={role === 'owner'} />
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        )}
      </div>
    </ContentReveal>
  )
}
