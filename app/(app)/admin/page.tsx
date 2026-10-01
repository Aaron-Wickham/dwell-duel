import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { adminHref, getRole } from '@/lib/auth/roles'

// /admin has no content of its own: it opens the first section this role can see.
export default async function AdminIndex() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  redirect(adminHref(await getRole(supabase)) ?? '/')
}
