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
import { formatLine, type MarketKind } from '@/lib/markets/kind'
import { DEFAULT_LIQUIDITY } from '@/lib/markets/lmsr'
import { marketOdds } from '@/lib/markets/pricing'
import { MarketCard } from '@/components/markets/market-card'
import { CategoryField } from '@/components/markets/category-field'
import { normalizeCategoryName } from '@/lib/markets/categories'
import { h2Class, labelClass } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import { nextWeeklyClose } from '@/lib/markets/weekly-close'
import { useTimeZone } from '@/components/ui/local-time'
import { cardPaddingClass } from '@/components/ui/card'

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

// update_market never changes the outcomes or the line, so the hint says so before it's too late
// (#266). The close time can move while the market is open, but not by a creator with money on it
// (can_move_market_close, 0106; #371).
function closeTimeHint(kind: MarketKind): string {
  const fixed = kind === 'over_under' ? 'The line and outcomes' : 'The outcomes'
  return `Betting stops at this time, so set it before the answer is known. ${fixed} can’t be changed later; you can move the close time while the market is open, unless you bet on it.`
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

// What the category field offers: every visible category's name, and the most used as chips.
export interface CategoryOptions {
  suggestions: string[]
  popular: string[]
}

const NO_CATEGORIES: CategoryOptions = { suggestions: [], popular: [] }

// admin: an admin may resolve a market they have money on, so the reviewer note isn't theirs.
export function CreateMarketForm({
  initial,
  admin = false,
  categories = NO_CATEGORIES,
}: {
  initial?: MarketPrefill
  admin?: boolean
  categories?: CategoryOptions
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [kind, setKind] = useState<MarketKind>(initial?.kind ?? 'binary')
  const [outcomes, setOutcomes] = useState(initial?.kind === 'multiple_choice' ? initial.outcomes : ['', ''])
  const [line, setLine] = useState(initial?.line ?? '')
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

  return (
    <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
      <form
        action={formAction}
        className={`flex flex-col gap-5 rounded-card border border-line bg-surface ${cardPaddingClass} shadow-card`}
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

        <CategoryField
          id="cm-category"
          value={category}
          onChange={setCategory}
          suggestions={categories.suggestions}
          popular={categories.popular}
          errorId="create-market-error"
          invalid={state?.field === 'category'}
        />

        <fieldset className="flex flex-col gap-1.5">
          <legend className={cn(labelClass, 'mb-1.5')}>Type</legend>
          <div className="grid gap-2 lg:grid-cols-3">
            {KIND_OPTIONS.map((option) => (
              <label
                key={option.kind}
                className="pressable relative flex min-h-11 cursor-pointer items-start gap-3 rounded-tile border border-line bg-surface p-3.5 has-checked:border-acc-text has-checked:bg-acc-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus md:p-4"
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

        <Field label="Close time" htmlFor="cm-close" hint={closeTimeHint(kind)}>
          <Input
            id="cm-close"
            type="datetime-local"
            required
            value={closeAt}
            onChange={(e) => setCloseAt(e.target.value)}
            aria-invalid={state?.field === 'close_at'}
            aria-describedby={['cm-close-hint', state?.field === 'close_at' ? 'create-market-error' : null].filter(Boolean).join(' ')}
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
      <MarketPreview kind={kind} title={title} category={category} outcomes={outcomes} line={line} closeAt={closeAt} admin={admin} />
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
  admin,
}: {
  admin: boolean
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
      {/* can_resolve_market (0046): nobody but an admin resolves a market they have money on. */}
      {!admin && <p className="text-sm text-ink2">If you bet on it, a reviewer resolves it.</p>}
      <MarketCard
        preview
        id="preview"
        title={title.trim() || 'Your market’s title'}
        category={normalizeCategoryName(category) || null}
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
