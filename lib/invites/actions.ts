'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { addInvite } from './add-invite'
import { revokeInvite } from './revoke-invite'

export interface AddInviteFormState {
  formError?: string
  addedEmail?: string
}

export async function addInviteAction(
  _prevState: AddInviteFormState | undefined,
  formData: FormData,
): Promise<AddInviteFormState | undefined> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }
  const email = String(formData.get('email') ?? '')
  const result = await addInvite(supabase, user.id, email)
  revalidatePath('/admin/invites')
  if (!result.ok) return { formError: result.formError }
  return { addedEmail: result.email }
}

export interface RevokeInviteFormState {
  formError?: string
}

export async function revokeInviteAction(
  _prevState: RevokeInviteFormState | undefined,
  formData: FormData,
): Promise<RevokeInviteFormState | undefined> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }
  const email = String(formData.get('email') ?? '')
  const result = await revokeInvite(supabase, email)
  revalidatePath('/admin/invites')
  if (!result.ok) return { formError: 'Could not revoke that invite.' }
  return undefined
}
