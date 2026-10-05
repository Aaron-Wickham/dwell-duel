import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { adminHref, getRole } from '@/lib/auth/roles'
import { getReviewCounts } from '@/lib/admin/review-counts'

// /admin has no content of its own: it opens the section with work waiting, else the first this
// role can see.
export default async function AdminIndex() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  const role = await getRole(supabase)
  redirect(adminHref(role, await getReviewCounts(supabase, role)) ?? '/')
}
