'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { isRole } from '@/lib/auth/roles'
import type { ConfirmActionState } from '@/components/ui/confirm-action-button'
import type { Database } from '@/lib/supabase/database'

type Fns = Database['public']['Functions']

function sentence(message: string): string {
  const text = message.charAt(0).toUpperCase() + message.slice(1)
  return /[.!?]$/.test(text) ? text : `${text}.`
}

// Each RPC checks the caller's role itself (0040); these actions only pass the request on and
// word the answer. Refreshing the whole layout keeps balances, lists and the nav current.
async function run<F extends keyof Fns>(fn: F, args: Fns[F]['Args']): Promise<ConfirmActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }
  const { error } = await supabase.rpc(fn, args)
  if (error) return { formError: sentence(error.message) }
  revalidatePath('/', 'layout')
  return undefined
}

export async function deleteMarketAction(marketId: string, _prev: ConfirmActionState, _formData: FormData) {
  return run('delete_market', { p_market_id: marketId })
}

export async function deleteTaskAction(taskId: string, _prev: ConfirmActionState, _formData: FormData) {
  return run('delete_task', { p_task_id: taskId })
}

export async function removeBetAction(betId: number, _prev: ConfirmActionState, _formData: FormData) {
  return run('remove_bet', { p_bet_id: betId })
}

// remove_member (0068): back to member, invite gone, devices unsubscribed; coins and bets untouched.
export async function removeMemberAction(profileId: string, _prev: ConfirmActionState, _formData: FormData) {
  return run('remove_member', { p_profile_id: profileId })
}

export type SetRoleState = { formError?: string; saved?: boolean } | undefined

export async function setMemberRoleAction(profileId: string, _prev: SetRoleState, formData: FormData): Promise<SetRoleState> {
  const role = formData.get('role')
  if (!isRole(role) || role === 'owner') return { formError: 'Choose Admin, Reviewer or Member.' }
  const result = await run('set_member_role', { p_profile_id: profileId, p_role: role })
  return result ?? { saved: true }
}
