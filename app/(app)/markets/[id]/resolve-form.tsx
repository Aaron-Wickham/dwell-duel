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
// An override can't name the outcome that already won (resolve_market_core, 0066): the select
// disables it, and an over/under refuses an actual number that lands on the current side.
export function ResolveForm({
  marketId,
  outcomes,
  line = null,
  override = false,
  currentOutcomeId = null,
}: {
  marketId: string
  outcomes: { id: string; label: string }[]
  line?: number | null
  override?: boolean
  currentOutcomeId?: string | null
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
  // Only an error about the winner marks the winner's field: a lost attachment or a sign-in problem
  // shows as a message on its own (#219).
  const outcomeError = state?.field === 'outcome'
  const actualNumber = actual.trim() === '' ? NaN : Number(actual)
  const current = override ? (outcomes.find((o) => o.id === currentOutcomeId) ?? null) : null
  const sideFor = (n: number) => `${n > line! ? 'Over' : 'Under'} ${formatLine(line!)}`
  const winner =
    line !== null
      ? Number.isFinite(actualNumber) && actualNumber !== line
        ? sideFor(actualNumber)
        : null
      : (outcomes.find((o) => o.id === outcomeId)?.label ?? null)
  const actualValidity = (value: string) => {
    if (value === '') return ''
    if (Number(value) === line) return 'The result can’t equal the line.'
    if (current && sideFor(Number(value)) === current.label) return 'That side is already the result.'
    return ''
  }

  return (
    <>
      <form id={FORM_ID} action={formAction} onSubmit={confirm.onSubmit} className="flex flex-col gap-4">
        {line !== null ? (
          <Field
            label="Actual result"
            htmlFor="resolve-actual"
            hint={current ? `The line is ${formatLine(line)}. ${current.label} is the current result.` : `The line is ${formatLine(line)}.`}
          >
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
                // resolve_over_under refuses a tie and the current side, so the browser stops
                // both before the confirmation.
                e.target.setCustomValidity(actualValidity(e.target.value))
              }}
              className="md:w-40"
              aria-invalid={Boolean(outcomeError)}
              aria-describedby={['resolve-actual-hint', outcomeError ? 'resolve-error' : null, 'resolve-preview'].filter(Boolean).join(' ')}
            />
            <p id="resolve-preview" className="text-sm font-bold" aria-live="polite">
              {actual !== '' && Number.isFinite(Number(actual))
                ? Number(actual) === line
                  ? 'That equals the line; check the number.'
                  : current && sideFor(Number(actual)) === current.label
                    ? `${current.label} is already the result.`
                    : `${sideFor(Number(actual))} wins.`
                : ''}
            </p>
          </Field>
        ) : (
          <Field
            label="Winning outcome"
            htmlFor="resolve-outcome"
            hint={current ? `${current.label} is the current result, so an override names a different outcome.` : undefined}
          >
            <Select
              id="resolve-outcome"
              name="outcome_id"
              required
              value={outcomeId}
              onChange={(e) => setOutcomeId(e.target.value)}
              aria-invalid={Boolean(outcomeError)}
              aria-describedby={[current ? 'resolve-outcome-hint' : null, outcomeError ? 'resolve-error' : null].filter(Boolean).join(' ') || undefined}
            >
              <option value="" disabled>
                Choose the winner…
              </option>
              {outcomes.map((o) => (
                <option key={o.id} value={o.id} disabled={o.id === current?.id}>
                  {o.id === current?.id ? `${o.label} (current result)` : o.label}
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
              ? 'The previous payouts are reversed, then winning solo bets on this outcome are paid. Every parlay with a pick here is settled again on the new result.'
              : 'Winning solo bets are paid straight away. A parlay with a pick here is lost if that pick lost, and pays once every pick has won.'}
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
