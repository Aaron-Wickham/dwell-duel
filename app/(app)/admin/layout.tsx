import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { atLeast, getRole } from '@/lib/auth/roles'
import { Page, PageHeader } from '@/components/ui/page'
import { AdminNav } from '@/components/admin/admin-nav'
import { ClosingAlertsWarning } from '@/components/admin/closing-alerts-warning'
import { readClosingAlertsHealth } from '@/lib/admin/cron-health'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Reviewers and up get the Admin header; each page keeps its own, stricter check, because a
  // layout doesn't re-render when you move between its pages.
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  const role = await getRole(supabase)
  if (!atLeast(role, 'reviewer')) redirect('/')
  // A Server Component renders once per request, so the purity rule's re-render worry doesn't apply.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const closingAlerts = await readClosingAlertsHealth(supabase, role, now)

  return (
    <Page transition="drill-down">
      <div className="flex flex-col gap-4">
        <PageHeader title="Admin" />
        <AdminNav role={role} />
      </div>
      <ClosingAlertsWarning health={closingAlerts} now={now} />
      {children}
    </Page>
  )
}
