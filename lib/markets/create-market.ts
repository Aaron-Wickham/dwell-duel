'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'

export type ActionState =
  | { formError?: string; field?: 'title' | 'description' | 'close_at' | 'outcomes' | `outcome_${number}` }
  | undefined

const MIN_OUTCOMES = 2

export async function createMarketAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  // A textarea's newlines arrive as CRLF once the browser serialises the form, doubling up
  // against maxLength, which counts one character per line break.
  const description = String(formData.get('description') ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  const kind = String(formData.get('kind') ?? '')
  const closeAt = String(formData.get('close_at') ?? '')

  if (!title) return { formError: 'Enter a title.', field: 'title' }
  if (title.length > TEXT_LIMITS.marketTitle) return { formError: tooLong('Title', TEXT_LIMITS.marketTitle), field: 'title' }
  if (description.length > TEXT_LIMITS.marketDescription) {
    return { formError: tooLong('Description', TEXT_LIMITS.marketDescription), field: 'description' }
  }
  if (kind !== 'binary' && kind !== 'multiple_choice') return { formError: 'Choose a market kind.' }

  const closeAtDate = closeAt ? new Date(closeAt) : null
  if (!closeAtDate || Number.isNaN(closeAtDate.getTime()) || closeAtDate.getTime() <= Date.now()) {
    return { formError: 'Choose a close time in the future.', field: 'close_at' }
  }

  // One line per outcome input, blanks included, so a line's position matches the form's "Outcome N".
  const outcomeLines =
    kind === 'binary'
      ? formData.getAll('outcome_labels').map(String)
      : String(formData.get('outcome_labels_text') ?? '')
          .split('\n')
          .map((s) => s.trim())
  const outcomeLabels = kind === 'binary' ? outcomeLines : outcomeLines.filter(Boolean)

  if (outcomeLabels.length < MIN_OUTCOMES) return { formError: 'Enter at least 2 outcomes.', field: 'outcomes' }

  const longOutcome = outcomeLines.findIndex((label) => label.length > TEXT_LIMITS.outcomeLabel)
  if (longOutcome !== -1) {
    const n = longOutcome + 1
    return { formError: tooLong(`Outcome ${n}`, TEXT_LIMITS.outcomeLabel), field: `outcome_${n}` }
  }

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
