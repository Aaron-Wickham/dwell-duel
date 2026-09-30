'use client'

import { useActionState, useState } from 'react'
import { ProofPicker } from '@/components/proof/proof-picker'
import { ConfirmSubmitDialog, useConfirmSubmit } from '@/components/ui/confirm-submit-dialog'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Field, Select, Textarea } from '@/components/ui/field'
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { discardProof, uploadProof } from '@/lib/proof/upload'
import type { ProofDraft, ProofRecord } from '@/lib/proof/types'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { resolveMarketAction, type ActionState } from '@/lib/markets/resolve-market'
import { formatLine } from '@/lib/markets/kind'
import { focusPageHeading } from '@/lib/ui/focus-page-heading'
import { Input } from '@/components/ui/field'

const FORM_ID = 'resolve-form'

// Every resolution and override says why (0042), and can carry photos, a document and links that
// every member sees. Files upload from the browser first, and are removed again if resolving fails.
// An over/under (`line` set) resolves on the actual number instead of a chosen outcome
// (resolve_over_under, 0043), with a live preview of which side that makes the winner.
// Paying out, or reversing earlier payouts for an override, waits for a confirmation naming the winner.
export function ResolveForm({
  marketId,
  outcomes,
  line = null,
  override = false,
}: {
  marketId: string
  outcomes: { id: string; label: string }[]
  line?: number | null
  override?: boolean
}) {
  const [drafts, setDrafts] = useState<ProofDraft[]>([])
  const [actual, setActual] = useState('')
  const [outcomeId, setOutcomeId] = useState('')
  const [note, setNote] = useState('')
  const [done, setDone] = useState(false)
  const confirm = useConfirmSubmit()
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    withSuccessToast(
      async (prev: ActionState, formData: FormData) => {
        // The dialog closes whatever happens (#199): an error left open behind it looked like a
        // confirmation that did nothing, and Confirm again re-ran the upload.
        try {
          let records: ProofRecord[] = []
          try {
            records = await uploadProof(drafts, `resolution/${marketId}/`)
          } catch (error) {
            return { formError: error instanceof Error ? error.message : 'An attachment didn’t upload. Try again.' }
          }
          formData.set('attachments', JSON.stringify(records))
          const next = await resolveMarketAction(marketId, prev, formData)
          if (next?.formError) {
            // Best effort: strays are swept daily, and a failed cleanup must never hide the real error.
            await discardProof(records).catch(() => {})
          } else {
            setDrafts([])
            setActual('')
            setOutcomeId('')
            setNote('')
            setDone(true)
          }
          return next
        } finally {
          confirm.setOpen(false)
        }
      },
      (s) => Boolean(s?.formError),
      override ? 'Resolution overridden.' : 'Market resolved.',
    ),
    undefined,
  )
  const outcomeError = state?.formError && state.field !== 'note'
  const actualNumber = actual.trim() === '' ? NaN : Number(actual)
  const winner =
    line !== null
      ? Number.isFinite(actualNumber) && actualNumber !== line
        ? `${actualNumber > line ? 'Over' : 'Under'} ${formatLine(line)}`
        : null
      : (outcomes.find((o) => o.id === outcomeId)?.label ?? null)

  return (
    <>
      <form id={FORM_ID} action={formAction} onSubmit={confirm.onSubmit} className="flex flex-col gap-4">
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
              onChange={(e) => {
                setActual(e.target.value)
                // resolve_over_under refuses a tie, so the browser stops it before the confirmation.
                e.target.setCustomValidity(e.target.value !== '' && Number(e.target.value) === line ? 'The result can’t equal the line.' : '')
              }}
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
              value={outcomeId}
              onChange={(e) => setOutcomeId(e.target.value)}
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
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={TEXT_LIMITS.resolutionNote}
            aria-invalid={state?.field === 'note'}
            aria-describedby={['resolve-note-hint', state?.field === 'note' ? 'resolve-error' : null].filter(Boolean).join(' ')}
          />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[15px] font-bold">Proof (optional)</legend>
          <ProofPicker id="resolve-proof" value={drafts} onChange={setDrafts} />
        </fieldset>
        <FormSubmitButton block>{override ? 'Override resolution' : 'Resolve market'}</FormSubmitButton>
      </form>
      <ConfirmSubmitDialog
        formId={FORM_ID}
        open={confirm.open}
        onOpenChange={confirm.setOpen}
        pending={isPending}
        finalFocus={done ? focusPageHeading : true}
        title={override ? 'Override the resolution?' : 'Resolve this market?'}
        description={
          <>
            <strong className="text-ink">{winner} wins.</strong>{' '}
            {override
              ? 'The previous payouts are reversed, then winning bets and parlay legs are paid out on this outcome.'
              : 'Winning bets and parlay legs are paid out straight away.'}
          </>
        }
        confirmLabel="Confirm outcome"
      />
      {state?.formError && (
        <Message tone="error" id="resolve-error">
          {state.formError}
        </Message>
      )}
    </>
  )
}
