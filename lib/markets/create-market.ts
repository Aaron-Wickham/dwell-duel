'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function createMarketAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const kind = String(formData.get('kind') ?? '')
  const closeAt = String(formData.get('close_at') ?? '')

  if (!title) return { formError: 'Enter a title.' }
  if (kind !== 'binary' && kind !== 'multiple_choice') return { formError: 'Choose a market kind.' }
  if (!closeAt) return { formError: 'Choose a close time.' }

  const outcomeLabels =
    kind === 'binary'
      ? formData.getAll('outcome_labels').map(String)
      : String(formData.get('outcome_labels_text') ?? '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)

  const { data: marketId, error } = await supabase.rpc('create_market', {
    p_title: title,
    p_description: description || null,
    p_kind: kind,
    p_outcome_labels: outcomeLabels,
    p_close_at: closeAt,
  })

  if (error) return { formError: error.message }

  redirect(`/markets/${marketId}`)
}
