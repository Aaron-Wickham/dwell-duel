import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { Page, PageHeader } from '@/components/ui/page'
import { AdminNav } from '@/components/admin/admin-nav'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // The same gate as every admin page, so a non-admin never gets the Admin header. The pages keep
  // their own checks, because a layout doesn't re-render when you move between its pages.
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  return (
    <Page>
      <div className="flex flex-col gap-4">
        <PageHeader title="Admin" />
        <AdminNav />
      </div>
      {children}
    </Page>
  )
}
