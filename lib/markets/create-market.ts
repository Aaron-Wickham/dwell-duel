'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import { friendlyError } from '@/lib/errors/friendly-error'
import { afterAction, notifyNewMarket } from '@/lib/push/notify'
import { isUuid } from '@/lib/uuid'
import { CREATE_MARKET_ERRORS } from './create-market-errors'

export type ActionState =
  | { formError?: string; field?: 'title' | 'description' | 'close_at' | 'outcomes' | 'line' | `outcome_${number}` }
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
  // useOffline replays an action whose response was lost; the key makes that return the first market (#258).
  const attemptKey = String(formData.get('idempotency_key') ?? '')
  const p_idempotency_key = isUuid(attemptKey) ? attemptKey : undefined

  if (!title) return { formError: 'Enter a title.', field: 'title' }
  if (title.length > TEXT_LIMITS.marketTitle) return { formError: tooLong('Title', TEXT_LIMITS.marketTitle), field: 'title' }
  if (description.length > TEXT_LIMITS.marketDescription) {
    return { formError: tooLong('Description', TEXT_LIMITS.marketDescription), field: 'description' }
  }
  if (kind !== 'binary' && kind !== 'multiple_choice' && kind !== 'over_under') return { formError: 'Choose a market kind.' }

  const closeAtDate = closeAt ? new Date(closeAt) : null
  if (!closeAtDate || Number.isNaN(closeAtDate.getTime()) || closeAtDate.getTime() <= Date.now()) {
    return { formError: 'Choose a close time in the future.', field: 'close_at' }
  }

  // An over/under's outcomes come from its line, made by create_market itself (0043).
  if (kind === 'over_under') {
    const line = Number(formData.get('line'))
    if (!Number.isFinite(line) || line < 0.5 || line % 1 !== 0.5) {
      return { formError: 'Set the line to a half number, like 3.5.', field: 'line' }
    }
    const { data, error } = await supabase.rpc('create_market_v3', {
      p_title: title,
      p_description: description || null,
      p_kind: kind,
      p_outcome_labels: [],
      p_close_at: closeAt,
      p_line: line,
      p_idempotency_key,
    })
    if (error) return friendlyError(error, CREATE_MARKET_ERRORS, 'create_market failed')
    return finish(data)
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

  const { data, error } = await supabase.rpc('create_market_v3', {
    p_title: title,
    p_description: description || null,
    p_kind: kind,
    p_outcome_labels: outcomeLabels,
    p_close_at: closeAt,
    p_idempotency_key,
  })

  if (error) return friendlyError(error, CREATE_MARKET_ERRORS, 'create_market failed')

  return finish(data)
}

type Created = { market_id: string; replayed: boolean }

// A replay (Next re-sending an action whose response was lost) finds the market the first call made,
// whose own call already sent the new-market push.
function finish(data: unknown): never {
  const { market_id, replayed } = data as Created
  if (!replayed) afterAction(() => notifyNewMarket(market_id))
  redirect(`/markets/${market_id}`)
}
