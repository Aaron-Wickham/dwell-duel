'use client'

import { useActionState, useState } from 'react'
import type { CategoryCount } from '@/lib/markets/categories'
import { mergeCategoryAction, renameCategoryAction, setCategoryHiddenAction, type CategoryActionState } from '@/lib/admin/category-actions'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { Button } from '@/components/ui/button'
import { ConfirmSubmitDialog, useConfirmSubmit } from '@/components/ui/confirm-submit-dialog'
import { Field, Input, Select } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { dividedRowClass } from '@/components/ui/list-card'
import { Message } from '@/components/ui/message'
import { rowTitleClass } from '@/components/ui/page'
import { StatusChip } from '@/components/ui/status-chip'

const failed = (s: CategoryActionState) => Boolean(s?.formError)
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

// One category in Admin › Markets › Categories (0103): Rename and Merge open their panel inside the
// row; Hide and Unhide act straight away, since a hidden category keeps its markets and comes back
// the moment someone makes a market in it. Other can be renamed but never hidden or merged away:
// every market made without a category lands in it.
export function CategoryCard({ category, targets, fixed }: { category: CategoryCount; targets: CategoryCount[]; fixed: boolean }) {
  const [panel, setPanel] = useState<'rename' | 'merge' | null>(null)
  const hidden = category.hiddenAt !== null
  const base = `category-${category.id}`

  const [hideState, hideAction] = useActionState<CategoryActionState, FormData>(
    withSuccessToast(setCategoryHiddenAction.bind(null, category.id, !hidden), failed, hidden ? `${category.name} is shown again.` : `${category.name} is hidden.`),
    undefined,
  )

  return (
    <li className={`${dividedRowClass} flex flex-col gap-3`} aria-labelledby={`${base}-title`}>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`${base}-title`} className={`${rowTitleClass} break-words`}>
            {category.name}
          </h3>
          {hidden && <StatusChip tone="void">Hidden</StatusChip>}
        </div>
        <p className="text-sm text-ink2">
          {plural(category.markets, 'market')} · {category.openMarkets} taking bets
        </p>
      </div>
      {panel === null && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPanel('rename')}>
            Rename <span className="sr-only">{category.name}</span>
          </Button>
          {!fixed && targets.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setPanel('merge')}>
              Merge <span className="sr-only">{category.name}</span>
            </Button>
          )}
          {!fixed && (
            <form action={hideAction}>
              <FormSubmitButton variant="secondary" size="sm">
                {hidden ? 'Unhide' : 'Hide'} <span className="sr-only">{category.name}</span>
              </FormSubmitButton>
            </form>
          )}
        </div>
      )}
      {panel === null && hideState?.formError && <Message tone="error">{hideState.formError}</Message>}
      {panel === 'rename' && <RenamePanel category={category} onDone={() => setPanel(null)} />}
      {panel === 'merge' && <MergePanel category={category} targets={targets} onDone={() => setPanel(null)} />}
    </li>
  )
}

function RenamePanel({ category, onDone }: { category: CategoryCount; onDone: () => void }) {
  const [name, setName] = useState(category.name)
  const [state, formAction] = useActionState<CategoryActionState, FormData>(
    withSuccessToast(
      async (prev: CategoryActionState, formData: FormData) => {
        const next = await renameCategoryAction(category.id, prev, formData)
        if (next?.saved) onDone()
        return next
      },
      failed,
      'Category renamed.',
    ),
    undefined,
  )
  const id = `category-${category.id}-name`
  const errorId = `${id}-error`
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="New name" htmlFor={id}>
        <Input
          id={id}
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={TEXT_LIMITS.category}
          aria-invalid={Boolean(state?.formError)}
          aria-describedby={state?.formError ? errorId : undefined}
        />
      </Field>
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
      <div className="flex flex-wrap gap-2">
        <FormSubmitButton size="sm">Save name</FormSubmitButton>
        <Button variant="secondary" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// Moves every market into the chosen category, logging each one, and hides this one. It changes
// many markets at once, so it asks first.
function MergePanel({ category, targets, onDone }: { category: CategoryCount; targets: CategoryCount[]; onDone: () => void }) {
  const [into, setInto] = useState(targets[0]?.id ?? '')
  const confirm = useConfirmSubmit()
  const [state, formAction, isPending] = useActionState<CategoryActionState, FormData>(
    withSuccessToast(
      async (prev: CategoryActionState, formData: FormData) => {
        const next = await mergeCategoryAction(category.id, prev, formData)
        confirm.setOpen(false)
        if (next?.saved) onDone()
        return next
      },
      failed,
      `${category.name} merged.`,
    ),
    undefined,
  )
  const target = targets.find((t) => t.id === into)
  const formId = `category-${category.id}-merge`
  const selectId = `${formId}-into`
  const errorId = `${formId}-error`
  return (
    <form id={formId} action={formAction} onSubmit={confirm.onSubmit} className="flex flex-col gap-3 rounded-tile bg-sunk p-3.5">
      <Field label={`Merge ${category.name} into`} htmlFor={selectId}>
        <Select
          id={selectId}
          name="into"
          value={into}
          onChange={(e) => setInto(e.target.value)}
          aria-invalid={Boolean(state?.formError)}
          aria-describedby={state?.formError ? errorId : undefined}
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-sm text-ink2">
        Its {plural(category.markets, 'market')} move{category.markets === 1 ? 's' : ''} there, each change shows in the
        market’s edit history, and {category.name} is hidden.
      </p>
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
      <div className="flex flex-wrap gap-2">
        <FormSubmitButton size="sm">Merge</FormSubmitButton>
        <Button variant="secondary" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <ConfirmSubmitDialog
        formId={formId}
        open={confirm.open}
        onOpenChange={confirm.setOpen}
        pending={isPending}
        title={`Merge ${category.name} into ${target?.name ?? 'that category'}?`}
        description={`${plural(category.markets, 'market')} move from ${category.name} to ${target?.name ?? 'that category'}, and ${category.name} is hidden. Merging can’t be undone in one step.`}
        confirmLabel="Merge"
      />
    </form>
  )
}
