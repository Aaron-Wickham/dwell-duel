'use client'

import { useActionState, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { keepCheckedOnReset } from '@/lib/forms/keep-on-reset'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { cn } from '@/lib/utils'
import { createMarketAction, type ActionState } from '@/lib/markets/create-market'
import { formatLine, type MarketKind } from '@/lib/markets/kind'
import { computeOdds } from '@/lib/markets/odds'
import { MarketCard } from '@/components/markets/market-card'
import { h2Class } from '@/components/ui/page'
import { nextWeeklyClose } from '@/lib/markets/weekly-close'
import { useTimeZone } from '@/components/ui/local-time'

const MAX_OUTCOMES = 6
const MIN_OUTCOMES = 2

const toggleClass = (on: boolean) =>
  cn(
    'pressable flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] font-bold text-ink2',
    on && 'bg-surface text-ink shadow-tab',
  )

// A market being duplicated (?from=), read on the server. `closeAt` is the original's close.
export interface MarketPrefill {
  title: string
  description: string
  kind: MarketKind
  outcomes: string[]
  line: string
  closeAt: string
  now: number
}

export function CreateMarketForm({ initial }: { initial?: MarketPrefill }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [kind, setKind] = useState<MarketKind>(initial?.kind ?? 'binary')
  const [outcomes, setOutcomes] = useState(initial?.kind === 'multiple_choice' ? initial.outcomes : ['', ''])
  const [line, setLine] = useState(initial?.line ?? '')
  const [editedCloseAt, setCloseAt] = useState<string | null>(initial ? null : '')
  const timeZone = useTimeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  // Until it's edited, a duplicate's close time is worked out in the viewer's own time zone,
  // which the server can't know.
  const closeAt = editedCloseAt ?? (initial ? nextWeeklyClose(initial.closeAt, initial.now, timeZone) : '')
  const [state, formAction] = useActionState<ActionState, FormData>(createMarketAction, undefined)

  function updateOutcome(index: number, value: string) {
    setOutcomes((prev) => prev.map((outcome, i) => (i === index ? value : outcome)))
  }

  function addOutcome() {
    setOutcomes((prev) => (prev.length >= MAX_OUTCOMES ? prev : [...prev, '']))
  }

  function removeOutcome(index: number) {
    setOutcomes((prev) => (prev.length <= MIN_OUTCOMES ? prev : prev.filter((_, i) => i !== index)))
  }

  // Too few outcomes points at the first input; a too-long label points at its own.
  const outcomeInvalid = (index: number) =>
    state?.field === `outcome_${index + 1}` || (index === 0 && state?.field === 'outcomes')

  return (
    <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
      <form
        action={formAction}
        className="flex flex-col gap-5 rounded-card border border-line bg-surface p-[18px] shadow-card md:p-6"
      >
        <Field label="Title" htmlFor="cm-title">
          <Input
            id="cm-title"
            name="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TEXT_LIMITS.marketTitle}
            aria-invalid={state?.field === 'title'}
            aria-describedby={state?.field === 'title' ? 'create-market-error' : undefined}
          />
        </Field>

        <Field label="Description" htmlFor="cm-desc">
          <Textarea
            id="cm-desc"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={TEXT_LIMITS.marketDescription}
            aria-invalid={state?.field === 'description'}
            aria-describedby={state?.field === 'description' ? 'create-market-error' : undefined}
          />
        </Field>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-[15px] font-bold">Type</legend>
          <div className="grid grid-cols-1 gap-1.5 rounded-[14px] bg-sunk p-1 md:grid-cols-3">
            <label className={toggleClass(kind === 'binary')}>
              <input
                type="radio"
                name="kind"
                value="binary"
                checked={kind === 'binary'}
                ref={keepCheckedOnReset(kind === 'binary')}
                onChange={() => setKind('binary')}
                className="size-[18px] accent-primary"
              />
              Binary (Yes/No)
            </label>
            <label className={toggleClass(kind === 'multiple_choice')}>
              <input
                type="radio"
                name="kind"
                value="multiple_choice"
                checked={kind === 'multiple_choice'}
                ref={keepCheckedOnReset(kind === 'multiple_choice')}
                onChange={() => setKind('multiple_choice')}
                className="size-[18px] accent-primary"
              />
              Multiple choice
            </label>
            <label className={toggleClass(kind === 'over_under')}>
              <input
                type="radio"
                name="kind"
                value="over_under"
                checked={kind === 'over_under'}
                ref={keepCheckedOnReset(kind === 'over_under')}
                onChange={() => setKind('over_under')}
                className="size-[18px] accent-primary"
              />
              Over/Under
            </label>
          </div>
        </fieldset>

        {kind === 'binary' ? (
          <>
            <input type="hidden" name="outcome_labels" value="Yes" />
            <input type="hidden" name="outcome_labels" value="No" />
          </>
        ) : kind === 'over_under' ? (
          <Field
            label="Line"
            htmlFor="cm-line"
            hint="Members bet on whether the result lands over or under this number. Use a half number, like 3.5, so there’s never a tie."
          >
            <Input
              id="cm-line"
              name="line"
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0.5"
              required
              value={line}
              onChange={(e) => setLine(e.target.value)}
              className="md:w-40"
              aria-invalid={state?.field === 'line'}
              aria-describedby={['cm-line-hint', state?.field === 'line' ? 'create-market-error' : null].filter(Boolean).join(' ')}
            />
          </Field>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[15px] font-bold">Outcomes</legend>
            <span className="text-sm text-ink2">
              Up to {MAX_OUTCOMES} outcomes · {outcomes.length} of {MAX_OUTCOMES} used
            </span>
            {outcomes.map((value, index) => (
              <div key={index} className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`cm-outcome-${index}`}>{`Outcome ${index + 1}`}</label>
                <Input
                  id={`cm-outcome-${index}`}
                  value={value}
                  onChange={(e) => updateOutcome(index, e.target.value)}
                  maxLength={TEXT_LIMITS.outcomeLabel}
                  className="flex-1"
                  aria-invalid={outcomeInvalid(index) || undefined}
                  aria-describedby={outcomeInvalid(index) ? 'create-market-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => removeOutcome(index)}
                  disabled={outcomes.length <= MIN_OUTCOMES}
                  aria-label={`Remove outcome ${index + 1}`}
                  className="pressable inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink hover:bg-sunk disabled:cursor-not-allowed disabled:text-ink2 disabled:hover:bg-transparent"
                >
                  <X aria-hidden="true" className="size-5" />
                </button>
              </div>
            ))}
            <input type="hidden" name="outcome_labels_text" value={outcomes.join('\n')} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addOutcome}
              disabled={outcomes.length >= MAX_OUTCOMES}
              className="self-start"
            >
              <Plus aria-hidden="true" className="size-[18px]" />
              Add outcome
            </Button>
          </fieldset>
        )}

        <Field label="Close time" htmlFor="cm-close">
          <Input
            id="cm-close"
            type="datetime-local"
            required
            value={closeAt}
            onChange={(e) => setCloseAt(e.target.value)}
            aria-invalid={state?.field === 'close_at'}
            aria-describedby={state?.field === 'close_at' ? 'create-market-error' : undefined}
          />
        </Field>
        {/* The picker's value is local wall-clock time; the server needs the instant it names. */}
        <input type="hidden" name="close_at" value={closeAt ? new Date(closeAt).toISOString() : ''} />

        {state?.formError && (
          <Message tone="error" id="create-market-error">
            {state.formError}
          </Message>
        )}

        <FormSubmitButton block className="md:w-auto md:self-start">
          Create market
        </FormSubmitButton>
      </form>
      <MarketPreview kind={kind} title={title} outcomes={outcomes} line={line} closeAt={closeAt} />
    </div>
  )
}

// The card the market will get on Markets, from what's typed so far. A new market's odds are its
// seed pools alone, which are equal, so they go through the same computeOdds as a real card.
function MarketPreview({
  kind,
  title,
  outcomes,
  line,
  closeAt,
}: {
  kind: MarketKind
  title: string
  outcomes: string[]
  line: string
  closeAt: string
}) {
  const lineValue = line.trim() === '' ? null : Number(line)
  const shownLine = lineValue !== null && Number.isFinite(lineValue) ? lineValue : null
  const labels =
    kind === 'binary'
      ? ['Yes', 'No']
      : kind === 'over_under'
        ? [`Over ${shownLine === null ? '…' : formatLine(shownLine)}`, `Under ${shownLine === null ? '…' : formatLine(shownLine)}`]
        : outcomes.map((o, i) => o.trim() || `Outcome ${i + 1}`)
  const odds = computeOdds(
    labels.map((label, i) => ({ id: `preview-${i}`, label, pool_total: 0 })),
    1,
  )
  const closeDate = closeAt ? new Date(closeAt) : null
  return (
    <section
      aria-labelledby="cm-preview-title"
      className="hidden lg:sticky lg:top-[calc(72px+var(--safe-top)+24px)] lg:flex lg:flex-col lg:gap-3"
    >
      <h2 id="cm-preview-title" className={h2Class}>
        Preview
      </h2>
      <p className="text-sm text-ink2">How the card will look on Markets.</p>
      <MarketCard
        preview
        id="preview"
        title={title.trim() || 'Your market’s title'}
        status="open"
        kind={kind}
        line={shownLine}
        closeAt={closeDate && !Number.isNaN(closeDate.getTime()) ? closeDate.toISOString() : ''}
        resolvedAt={null}
        outcomes={odds.map((o) => ({
          id: o.outcomeId,
          label: o.label,
          pct: o.impliedProbability === null ? null : Math.round(o.impliedProbability * 100),
        }))}
        resolvedOutcomeLabel={null}
      />
    </section>
  )
}
