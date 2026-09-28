'use client'

import { useActionState, useState } from 'react'
import { ProofPicker } from '@/components/proof/proof-picker'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Field, Select, Textarea } from '@/components/ui/field'
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { discardProof, uploadProof } from '@/lib/proof/upload'
import type { ProofDraft, ProofRecord } from '@/lib/proof/types'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { resolveMarketAction, type ActionState } from '@/lib/markets/resolve-market'
import { formatLine } from '@/lib/markets/kind'
import { Input } from '@/components/ui/field'

// Every resolution and override says why (0042), and can carry photos, a document and links that
// every member sees. Files upload from the browser first, and are removed again if resolving fails.
// An over/under (`line` set) resolves on the actual number instead of a chosen outcome
// (resolve_over_under, 0043), with a live preview of which side that makes the winner.
export function ResolveForm({
  marketId,
  outcomes,
  line = null,
}: {
  marketId: string
  outcomes: { id: string; label: string }[]
  line?: number | null
}) {
  const [drafts, setDrafts] = useState<ProofDraft[]>([])
  const [actual, setActual] = useState('')
  const [state, formAction] = useActionState<ActionState, FormData>(
    withSuccessToast(
      async (prev: ActionState, formData: FormData) => {
        let records: ProofRecord[] = []
        try {
          records = await uploadProof(drafts, `resolution/${marketId}/`)
        } catch (error) {
          return { formError: error instanceof Error ? error.message : 'An attachment didn’t upload. Try again.' }
        }
        formData.set('attachments', JSON.stringify(records))
        const next = await resolveMarketAction(marketId, prev, formData)
        if (next?.formError) await discardProof(records)
        else setDrafts([])
        return next
      },
      (s) => Boolean(s?.formError),
      'Market resolved.',
    ),
    undefined,
  )
  const outcomeError = state?.formError && state.field !== 'note'

  return (
    <>
      <form action={formAction} className="flex flex-col gap-4">
        {line !== null ? (
          <Field label="Actual result" htmlFor="resolve-actual" hint={`The line is ${formatLine(line)}.`}>
            <Input
              id="resolve-actual"
              name="actual"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              required
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              className="md:w-40"
              aria-invalid={Boolean(outcomeError)}
              aria-describedby={['resolve-actual-hint', outcomeError ? 'resolve-error' : null, 'resolve-preview'].filter(Boolean).join(' ')}
            />
            <p id="resolve-preview" className="text-sm font-bold" aria-live="polite">
              {actual !== '' && Number.isFinite(Number(actual))
                ? Number(actual) === line
                  ? 'That equals the line; check the number.'
                  : `${Number(actual) > line ? 'Over' : 'Under'} ${formatLine(line)} wins.`
                : ''}
            </p>
          </Field>
        ) : (
          <Field label="Winning outcome" htmlFor="resolve-outcome">
            <Select
              id="resolve-outcome"
              name="outcome_id"
              required
              defaultValue=""
              aria-invalid={Boolean(outcomeError)}
              aria-describedby={outcomeError ? 'resolve-error' : undefined}
            >
              <option value="" disabled>
                Choose the winner…
              </option>
              {outcomes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Why did this outcome win?" htmlFor="resolve-note" hint="Everyone sees this, with any proof you add.">
          <Textarea
            id="resolve-note"
            name="note"
            required
            maxLength={TEXT_LIMITS.resolutionNote}
            aria-invalid={state?.field === 'note'}
            aria-describedby={['resolve-note-hint', state?.field === 'note' ? 'resolve-error' : null].filter(Boolean).join(' ')}
          />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[15px] font-bold">Proof (optional)</legend>
          <ProofPicker id="resolve-proof" value={drafts} onChange={setDrafts} />
        </fieldset>
        <FormSubmitButton block>Confirm outcome</FormSubmitButton>
      </form>
      {state?.formError && (
        <Message tone="error" id="resolve-error">
          {state.formError}
        </Message>
      )}
    </>
  )
}
