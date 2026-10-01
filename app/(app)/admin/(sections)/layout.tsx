import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { atLeast, getRole } from '@/lib/auth/roles'
import { Page, PageHeader } from '@/components/ui/page'
import { AdminNav } from '@/components/admin/admin-nav'
import { ClosingAlertsWarning } from '@/components/admin/closing-alerts-warning'
import { readClosingAlertsHealth } from '@/lib/admin/cron-health'
import { getReviewCounts } from '@/lib/admin/review-counts'

// docs/ADMIN-GUIDE.md on GitHub (the repo is public), so the guide is read where it's maintained.
const ADMIN_GUIDE_URL = 'https://github.com/Aaron-Wickham/dwell-duel/blob/main/docs/ADMIN-GUIDE.md'

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
  // The tab counts are a nicety, like the badge they explain: without them the tabs still render.
  const [closingAlerts, counts] = await Promise.all([
    readClosingAlertsHealth(supabase, role, now),
    getReviewCounts(supabase, role).catch((error: unknown) => {
      console.error('Reading the review counts failed', error)
      return { tasks: 0, markets: 0 }
    }),
  ])

  return (
    <Page transition="drill-down">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Admin"
          description={
            <>
              How to invite, resolve, void, review and more:{' '}
              <a href={ADMIN_GUIDE_URL} target="_blank" rel="noreferrer">
                the Admin guide
              </a>
              .
            </>
          }
        />
        <AdminNav role={role} counts={counts} />
      </div>
      <ClosingAlertsWarning health={closingAlerts} now={now} />
      {children}
    </Page>
  )
}
