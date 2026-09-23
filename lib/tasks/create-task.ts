'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const

export async function createTaskAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const rewardAmount = Number(formData.get('reward_amount'))
  const isRepeatable = formData.get('is_repeatable') === 'on'
  const period = String(formData.get('period') ?? '')

  if (!title) return { formError: 'Enter a title.' }
  if (!Number.isInteger(rewardAmount) || rewardAmount <= 0) {
    return { formError: 'Enter a whole number of DC greater than 0.' }
  }
  if (isRepeatable && !PERIODS.includes(period as (typeof PERIODS)[number])) {
    return { formError: 'Choose a cadence for a repeatable task.' }
  }

  const { error } = await supabase.from('tasks').insert({
    title,
    description: description || null,
    reward_amount: rewardAmount,
    is_repeatable: isRepeatable,
    period: isRepeatable ? period : null,
  })

  if (error) return { formError: error.message }

  revalidatePath('/admin/tasks')
  return undefined
}
