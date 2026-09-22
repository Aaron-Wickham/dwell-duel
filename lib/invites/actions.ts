'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { addInvite } from './add-invite'
import { revokeInvite } from './revoke-invite'

export async function addInviteAction(formData: FormData) {
  const { supabase, user } = await requireUser()
  if (!user) return
  const email = String(formData.get('email') ?? '')
  await addInvite(supabase, user.id, email)
  revalidatePath('/admin/invites')
}

export async function revokeInviteAction(formData: FormData) {
  const { supabase, user } = await requireUser()
  if (!user) return
  const email = String(formData.get('email') ?? '')
  await revokeInvite(supabase, email)
  revalidatePath('/admin/invites')
}
