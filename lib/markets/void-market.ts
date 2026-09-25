'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function voidMarketAction(
  marketId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const { error } = await supabase.rpc('void_market', { p_market_id: marketId })

  if (error) return { formError: error.message }

  revalidatePath(`/markets/${marketId}`)
  revalidatePath('/parlays')
  return undefined
}
