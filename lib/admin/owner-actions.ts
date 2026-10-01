'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { isRole } from '@/lib/auth/roles'
import { friendlyError, type KnownError } from '@/lib/errors/friendly-error'
import type { ConfirmActionState } from '@/components/ui/confirm-action-button'
import type { Database } from '@/lib/supabase/database'

type Fns = Database['public']['Functions']

// The raises of set_member_role, delete_market, delete_task, remove_bet (0040), remove_member (0068)
// and reinvite_member (0093).
const OWNER_ERRORS: readonly KnownError<never>[] = [
  { match: 'only the owner can change roles', formError: 'Only the owner can change roles.' },
  { match: 'role must be admin, reviewer or member', formError: 'Choose Admin, Reviewer or Member.' },
  { match: "the owner's own role can't be changed", formError: 'The owner’s own role can’t be changed.' },
  { match: 'member not found', formError: 'This member no longer exists.' },
  { match: 'only the owner can delete a market', formError: 'Only the owner can delete a market.' },
  { match: 'market not found', formError: 'This market no longer exists.' },
  { match: 'this market has bets, so void it instead', formError: 'This market has bets, so void it instead.' },
  { match: 'only the owner can delete a task', formError: 'Only the owner can delete a task.' },
  { match: 'task not found', formError: 'This task no longer exists.' },
  { match: 'members have submitted this task, so deactivate it instead', formError: 'Members have submitted this task, so deactivate it instead.' },
  { match: 'only the owner can remove a bet', formError: 'Only the owner can remove a bet.' },
  { match: 'bet not found', formError: 'This bet no longer exists.' },
  { match: "this market is no longer open, so the bet can't be removed", formError: 'This market is no longer open, so the bet can’t be removed.' },
  { match: 'only the owner can remove a member', formError: 'Only the owner can remove a member.' },
  { match: "the owner can't be removed", formError: 'The owner can’t be removed.' },
  { match: 'only the owner can invite a member back', formError: 'Only the owner can invite a member back.' },
  { match: 'this member has no email to invite', formError: 'There’s no email on file for this member, so there’s nothing to invite.' },
]

// Each RPC checks the caller's role itself (0040); these actions only pass the request on and
// word the answer. Refreshing the whole layout keeps balances, lists and the nav current.
async function run<F extends keyof Fns>(fn: F, args: Fns[F]['Args']): Promise<ConfirmActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }
  const { error } = await supabase.rpc(fn, args)
  if (error) return friendlyError(error, OWNER_ERRORS, `${fn} failed`)
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

// reinvite_member (0093): their invite back, claimed by them; their role stays Member.
export async function reinviteMemberAction(profileId: string, _prev: ConfirmActionState, _formData: FormData) {
  return run('reinvite_member', { p_profile_id: profileId })
}

export type SetRoleState = { formError?: string; saved?: boolean } | undefined

export async function setMemberRoleAction(profileId: string, _prev: SetRoleState, formData: FormData): Promise<SetRoleState> {
  const role = formData.get('role')
  if (!isRole(role) || role === 'owner') return { formError: 'Choose Admin, Reviewer or Member.' }
  const result = await run('set_member_role', { p_profile_id: profileId, p_role: role })
  return result ?? { saved: true }
}
