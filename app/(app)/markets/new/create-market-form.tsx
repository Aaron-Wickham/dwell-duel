'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { fingerprintOf, useAttemptKey } from '@/lib/forms/attempt-key'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { keepCheckedOnReset } from '@/lib/forms/keep-on-reset'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { createMarketAction, type ActionState } from '@/lib/markets/create-market'
import { LINE_ERROR } from '@/lib/markets/create-market-errors'
import { formatLine, type MarketKind } from '@/lib/markets/kind'
import { DEFAULT_LIQUIDITY } from '@/lib/markets/lmsr'
import { marketOdds } from '@/lib/markets/pricing'
import { MarketCard } from '@/components/markets/market-card'
import { CategoryPickerField } from '@/components/markets/category-picker'
import { normalizeCategoryName } from '@/lib/markets/categories'
import { h2Class, labelClass } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import { nextWeeklyClose } from '@/lib/markets/weekly-close'
import { useTimeZone } from '@/components/ui/local-time'
import { cardClass, cardPaddingClass } from '@/components/ui/card'

const MAX_OUTCOMES = 6
const MIN_OUTCOMES = 2

// Each type says what it asks, since a member making their first market can't be expected to know
// "binary" or "over/under" (#352). The native radio stays, transparent and covering its card, so
// it's the control a tap, a screen reader and the keyboard all use; the drawn dot only mirrors it.
const KIND_OPTIONS: { kind: MarketKind; label: string; hint: string }[] = [
  { kind: 'binary', label: 'Yes/No', hint: 'Will it happen or not?' },
  { kind: 'multiple_choice', label: 'Multiple choice', hint: 'Members pick one of 2 to 6 answers.' },
  { kind: 'over_under', label: 'Over/Under', hint: 'Will a number land above or below a line?' },
]

// The close-time hint says only what the time does (COPY-11). What can't change later is said
// beside the preview, where it's read before Create market.
const CLOSE_TIME_HINT = 'Betting stops here, so pick a time before anyone knows the answer.'

const isHalfLine = (line: string) => {
  const n = Number(line)
  return line.trim() !== '' && Number.isFinite(n) && n >= 0.5 && n % 1 === 0.5
}

// The control each refusal belongs to, so its message shows beside it and focus moves there.
function controlFor(field: NonNullable<ActionState>['field']): string | null {
  if (!field) return null
  if (field === 'outcomes') return 'cm-outcome-0'
  const outcome = /^outcome_(\d+)$/.exec(field)
  if (outcome) return `cm-outcome-${Number(outcome[1]) - 1}`
  const ids: Record<string, string> = { title: 'cm-title', line: 'cm-line', close_at: 'cm-close', category: 'cm-category', description: 'cm-desc' }
  return ids[field] ?? null
}

// A market being duplicated (?from=), read on the server. `closeAt` is the original's close.
export interface MarketPrefill {
  title: string
  description: string
  kind: MarketKind
  // Its category's name.
  category: string
  outcomes: string[]
  line: string
  closeAt: string
  now: number
}

// admin: an admin may resolve a market they have money on, so the reviewer note isn't theirs.
export function CreateMarketForm({
  initial,
  admin = false,
  categories = [],
}: {
  initial?: MarketPrefill
  admin?: boolean
  // Every visible category's name, most used first.
  categories?: string[]
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [kind, setKind] = useState<MarketKind>(initial?.kind ?? 'binary')
  const [outcomes, setOutcomes] = useState(initial?.kind === 'multiple_choice' ? initial.outcomes : ['', ''])
  const [line, setLine] = useState(initial?.line ?? '')
  const [lineChecked, setLineChecked] = useState(false)
  const [editedCloseAt, setCloseAt] = useState<string | null>(initial ? null : '')
  const timeZone = useTimeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  // Until it's edited, a duplicate's close time is worked out in the viewer's own time zone,
  // which the server can't know.
  const closeAt = editedCloseAt ?? (initial ? nextWeeklyClose(initial.closeAt, initial.now, timeZone) : '')
  const attemptKey = useAttemptKey()
  const [state, formAction] = useActionState<ActionState, FormData>(async (prev, formData) => {
    // Held across a lost response and Next's replay, so a market that committed isn't made twice (#258).
    formData.set('idempotency_key', attemptKey.claim(fingerprintOf(formData)))
    const next = await createMarketAction(prev, formData)
    // Only a refusal comes back here (success redirects), and it made nothing, so the next try is a new attempt.
    attemptKey.release()
    return next
  }, undefined)

  // A refusal moves focus to the field it names, which on a phone may be a screen above the button.
  useEffect(() => {
    const id = controlFor(state?.field)
    if (id) document.getElementById(id)?.focus()
  }, [state])
  const errorFor = (field: NonNullable<ActionState>['field']) => (state && state.field === field ? state.formError : undefined)
  const outcomeError = state?.field === 'outcomes' || state?.field?.startsWith('outcome_') ? state?.formError : undefined
  // The line is checked once it's been left, then as it's typed, so 3 on the way to 3.5 isn't flagged.
  const lineError = lineChecked && line.trim() !== '' && !isHalfLine(line) ? LINE_ERROR : errorFor('line')

  function updateOutcome(index: number, value: string) {
    setOutcomes((prev) => prev.map((outcome, i) => (i === index ? value : outcome)))
  }

  function addOutcome() {
    setOutcomes((prev) => (prev.length >= MAX_OUTCOMES ? prev : [...prev, '']))
  }

  // Removing the last row unmounts the focused button, and reaching the minimum disables it, so
  // either would drop a keyboard user's focus onto <body>. It moves to the input beside it instead.
  const focusOutcomeAfterRemove = useRef<number | null>(null)
  function removeOutcome(index: number) {
    if (outcomes.length <= MIN_OUTCOMES) return
    const left = outcomes.length - 1
    if (index === left || left <= MIN_OUTCOMES) focusOutcomeAfterRemove.current = Math.min(index, left - 1)
    setOutcomes((prev) => (prev.length <= MIN_OUTCOMES ? prev : prev.filter((_, i) => i !== index)))
  }
  useEffect(() => {
    if (focusOutcomeAfterRemove.current === null) return
    document.getElementById(`cm-outcome-${focusOutcomeAfterRemove.current}`)?.focus()
    focusOutcomeAfterRemove.current = null
  }, [outcomes])

  // Too few outcomes points at the first input; a too-long label points at its own.
  const outcomeInvalid = (index: number) =>
    state?.field === `outcome_${index + 1}` || (index === 0 && state?.field === 'outcomes')
  const describe = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (kind !== 'over_under' || isHalfLine(line)) return
          event.preventDefault()
          setLineChecked(true)
          document.getElementById('cm-line')?.focus()
        }}
        className={`flex flex-col gap-5 ${cardClass} ${cardPaddingClass}`}
      >
        <Field label="Title" htmlFor="cm-title" error={errorFor('title')}>
          <Input
            id="cm-title"
            name="title"
            required
            placeholder="Will the sermon run past noon?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TEXT_LIMITS.marketTitle}
            aria-invalid={state?.field === 'title'}
            aria-describedby={describe(state?.field === 'title' && 'cm-title-error')}
          />
        </Field>

        <fieldset className="flex flex-col gap-1.5">
          <legend className={cn(labelClass, 'mb-1.5')}>Type</legend>
          <div className="grid gap-2 lg:grid-cols-3">
            {KIND_OPTIONS.map((option) => (
              <label
                key={option.kind}
                className="pressable relative flex min-h-11 cursor-pointer items-start gap-3 rounded-tile border border-line bg-surface p-3.5 has-checked:border-acc-text has-checked:bg-acc-soft has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus md:p-4"
              >
                <input
                  type="radio"
                  name="kind"
                  value={option.kind}
                  checked={kind === option.kind}
                  ref={keepCheckedOnReset(kind === option.kind)}
                  onChange={() => setKind(option.kind)}
                  aria-labelledby={`cm-kind-${option.kind}`}
                  aria-describedby={`cm-kind-${option.kind}-hint`}
                  className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-tile opacity-0"
                />
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-line-s peer-checked:border-acc-text peer-checked:[&>span]:bg-acc-text"
                >
                  <span className="size-2.5 rounded-full" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span id={`cm-kind-${option.kind}`} className={labelClass}>
                    {option.label}
                  </span>
                  <span id={`cm-kind-${option.kind}-hint`} className="text-sm text-ink2">
                    {option.hint}
                  </span>
                </span>
              </label>
            ))}
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
            error={lineError}
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
              onBlur={() => setLineChecked(true)}
              className="md:w-40"
              aria-invalid={Boolean(lineError)}
              aria-describedby={describe('cm-line-hint', lineError && 'cm-line-error')}
            />
          </Field>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className={cn(labelClass, 'mb-2')}>Outcomes</legend>
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
                  aria-describedby={outcomeInvalid(index) ? 'cm-outcomes-error' : undefined}
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
            {outcomeError && (
              <p id="cm-outcomes-error" role="alert" className="text-sm font-bold text-loss">
                {outcomeError}
              </p>
            )}
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

        <Field label="Close time" htmlFor="cm-close" hint={CLOSE_TIME_HINT} error={errorFor('close_at')}>
          <Input
            id="cm-close"
            type="datetime-local"
            required
            value={closeAt}
            onChange={(e) => setCloseAt(e.target.value)}
            aria-invalid={state?.field === 'close_at'}
            aria-describedby={describe('cm-close-hint', state?.field === 'close_at' && 'cm-close-error')}
          />
        </Field>
        {/* The picker's value is local wall-clock time; the server needs the instant it names. */}
        <input type="hidden" name="close_at" value={closeAt ? new Date(closeAt).toISOString() : ''} />

        <CategoryPickerField
          id="cm-category"
          value={category}
          onChange={setCategory}
          options={categories}
          error={errorFor('category')}
        />

        <Field label="Details (optional)" htmlFor="cm-desc" error={errorFor('description')}>
          <Textarea
            id="cm-desc"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={TEXT_LIMITS.marketDescription}
            aria-invalid={state?.field === 'description'}
            aria-describedby={describe(state?.field === 'description' && 'cm-desc-error')}
          />
        </Field>

        {/* update_market never changes the outcomes or the line (#266); the close time can move while the
            market is open, but not by a creator with money on it (can_move_market_close, 0106; #371).
            can_resolve_market (0046): nobody but an admin resolves a market they have money on. Said
            here, next to Create market, rather than under the close time (COPY-11). */}
        <p className="text-sm text-ink2">
          {kind === 'over_under' ? 'The line and outcomes' : 'The outcomes'} can’t be changed later. You can move the close
          time while it’s open, unless you bet on it.{!admin && ' If you bet on it, a reviewer resolves it.'}
        </p>

        {/* A refusal that names no field (the type, a limit, the database) shows beside the button. */}
        {state?.formError && !controlFor(state.field) && (
          <Message tone="error" id="create-market-error">
            {state.formError}
          </Message>
        )}

        <FormSubmitButton block className="md:w-auto md:self-start" pendingLabel="Creating…">
          Create market
        </FormSubmitButton>
      </form>
      <MarketPreview kind={kind} title={title} category={category} outcomes={outcomes} line={line} closeAt={closeAt} />
    </div>
  )
}

// The card the market will get on Markets, from what's typed so far. A new market opens with no
// shares sold, at even prices (0102), so it goes through the same marketOdds as a real card.
function MarketPreview({
  kind,
  title,
  category,
  outcomes,
  line,
  closeAt,
}: {
  kind: MarketKind
  title: string
  category: string
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
  const odds = marketOdds({
    pricing: 'lmsr',
    liquidity: DEFAULT_LIQUIDITY,
    seedPerOutcome: 0,
    outcomes: labels.map((label, i) => ({ id: `preview-${i}`, label, poolTotal: 0, shares: 0, qOffset: 0 })),
  })
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
        category={normalizeCategoryName(category) || null}
        status="open"
        kind={kind}
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
