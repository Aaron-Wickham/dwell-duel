import { redirect } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { atLeast, getRole } from '@/lib/auth/roles'
import { listTasks } from '@/lib/tasks/list-tasks'
import { getReviewCounts } from '@/lib/admin/review-counts'
import { newestHref, readPageParams, showMoreHref } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { NothingOlder } from '@/components/ui/nothing-older'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { listPendingTaskCompletions } from '@/lib/tasks/list-task-completions'
import { ageLabel } from '@/lib/social/relative-time'
import { SectionCard } from '@/components/ui/section-card'
import { StatusChip } from '@/components/ui/status-chip'
import { EmptyState } from '@/components/ui/empty-state'
import { listCardsClass } from '@/components/ui/list-card'
import { cn } from '@/lib/utils'
import { ContentReveal } from '@/components/nav/page-transition'
import { CreateTaskForm } from './create-task-form'
import { PENDING_ROW_ID_PREFIX, PendingApprovals } from './pending-approvals'
import { TaskCatalogItem } from './task-catalog-item'

export default async function AdminTasksPage(props: PageProps<'/admin/tasks'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  const role = await getRole(supabase)
  if (!atLeast(role, 'reviewer')) redirect('/')
  const canManage = atLeast(role, 'admin')

  const [tasks, pendingPage, counts] = await Promise.all([
    canManage ? listTasks(supabase) : Promise.resolve([]),
    listPendingTaskCompletions(supabase, readPageParams(searchParams, 'after')),
    getReviewCounts(supabase, role),
  ])
  // Ages are worked out here, on the server, so the client-rendered list hydrates with the same text.
  const pending = pendingPage.rows.map((c) => ({ ...c, submittedAge: ageLabel(c.submittedAt) }))
  // What waits on this viewer, across the whole queue: their own submission is listed but reviewed
  // by someone else (0046), and my_review_counts leaves it out.
  const waiting = counts.tasks
  const backToNewestHref = newestHref('/admin/tasks', searchParams, 'after')

  return (
    <ContentReveal>
      <div className="flex flex-col gap-5 md:gap-7">
        <LiveTables subscriptions={pageSubscriptions.adminTasks()} />
        <SectionCard
          title="Pending approvals"
          titleId="pending-approvals"
          className="gap-4"
          action={waiting > 0 ? <StatusChip tone="wait">{waiting} waiting</StatusChip> : undefined}
        >
          <ShowMoreFocus />
          {pendingPage.windowed && pending.length > 0 && <BackToNewest href={backToNewestHref} />}
          <PendingApprovals
            pending={pending}
            viewerId={user.id}
            emptyState={pendingPage.windowed ? <NothingOlder href={backToNewestHref} /> : undefined}
          />
          {pendingPage.next && (
            <ShowMore
              href={showMoreHref('/admin/tasks', searchParams, 'after', pendingPage.next)}
              fresh={pendingPage.next.kind === 'window'}
              focusId={rowDomId(PENDING_ROW_ID_PREFIX, pendingPage.next.firstId)}
            />
          )}
        </SectionCard>
        {/* Reviewers only review; creating and editing tasks is for admins. */}
        {canManage && (
          <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-7">
            <SectionCard title="Create task" titleId="create-task" className="gap-4">
              <CreateTaskForm />
            </SectionCard>
            <SectionCard title="Task catalog" titleId="task-catalog">
              {tasks.length === 0 ? (
                <EmptyState icon={BookOpen} title="No tasks yet." />
              ) : (
                <ul className={cn(listCardsClass, 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-5')}>
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
