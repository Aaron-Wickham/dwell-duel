'use client'

import { useActionState, useState } from 'react'
import { createMarketAction, type ActionState } from '@/lib/markets/create-market'

export function CreateMarketForm() {
  const [kind, setKind] = useState<'binary' | 'multiple_choice'>('binary')
  const [closeAtIso, setCloseAtIso] = useState('')
  const [state, formAction] = useActionState<ActionState, FormData>(createMarketAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        Title
        <input name="title" required className="border px-2 py-1" />
      </label>

      <label className="flex flex-col gap-1">
        Description
        <textarea name="description" className="border px-2 py-1" />
      </label>

      <fieldset className="flex gap-4">
        <label>
          <input type="radio" name="kind" value="binary" checked={kind === 'binary'} onChange={() => setKind('binary')} />{' '}
          Yes/No
        </label>
        <label>
          <input
            type="radio"
            name="kind"
            value="multiple_choice"
            checked={kind === 'multiple_choice'}
            onChange={() => setKind('multiple_choice')}
          />{' '}
          Multiple choice
        </label>
      </fieldset>

      {kind === 'binary' ? (
        <>
          <input type="hidden" name="outcome_labels" value="Yes" />
          <input type="hidden" name="outcome_labels" value="No" />
        </>
      ) : (
        <label className="flex flex-col gap-1">
          Outcomes (one per line, 2-6)
          <textarea name="outcome_labels_text" rows={4} className="border px-2 py-1" placeholder={'Option A\nOption B'} />
        </label>
      )}

      <label className="flex flex-col gap-1">
        Close time
        <input
          type="datetime-local"
          required
          onChange={(e) => setCloseAtIso(e.target.value ? new Date(e.target.value).toISOString() : '')}
          className="border px-2 py-1"
        />
      </label>
      <input type="hidden" name="close_at" value={closeAtIso} />

      <button type="submit">Create market</button>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
