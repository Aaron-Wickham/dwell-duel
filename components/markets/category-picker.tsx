'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { dialogBackdropClass, dialogPopupClass } from '@/components/ui/dialog-classes'
import { Field, Input } from '@/components/ui/field'
import { IntentLink } from '@/components/ui/intent-link'
import { h2Class } from '@/components/ui/page'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { categorySlug, normalizeCategoryName } from '@/lib/markets/categories'
import { cn } from '@/lib/utils'

// Every visible category in one searchable list (#327's chips and More… outgrew a group with
// dozens): Markets' filter, and the Category field on Create and Edit market.

const rowClass =
  'pressable hover-tint relative flex min-h-12 w-full cursor-pointer items-center gap-3 py-2 text-left text-base text-ink no-underline'

function matches(name: string, query: string): boolean {
  return name.toLowerCase().includes(normalizeCategoryName(query).toLowerCase())
}

function RowContent({ name, current, detail, muted }: { name: string; current: boolean; detail?: string; muted?: boolean }) {
  return (
    <>
      <span className={cn('min-w-0 flex-1 break-words', current && 'font-bold')}>{name}</span>
      {detail && <span className={cn('shrink-0 whitespace-nowrap text-sm', muted ? 'text-ink2' : 'text-ink')}>{detail}</span>}
      <span className="flex size-5 shrink-0 items-center justify-center">
        {current && <Check aria-hidden="true" className="size-5 text-ink" />}
      </span>
    </>
  )
}

// The dialog both pickers share: a title, a search over the rows, and the rows themselves. The
// search takes focus only under a mouse or keyboard; a tap opens it with the popup focused, so a
// phone's keyboard doesn't cover the list.
function PickerDialog({
  open,
  onOpenChange,
  trigger,
  title,
  query,
  onQueryChange,
  onEnter,
  maxLength,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  title: string
  query: string
  onQueryChange: (query: string) => void
  onEnter?: () => void
  maxLength?: number
  children: ReactNode
}) {
  const searchRef = useRef<HTMLInputElement>(null)
  const searchId = useId()
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || !onEnter) return
    event.preventDefault()
    onEnter()
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) onQueryChange('')
        onOpenChange(next)
      }}
    >
      {trigger}
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdropClass} />
        {/* A fixed height, so the dialog doesn't jump as the search narrows the list. */}
        <Dialog.Popup
          initialFocus={(type) => (type === 'touch' ? true : searchRef.current)}
          className={cn(
            dialogPopupClass,
            'h-[min(640px,calc(100dvh-32px-var(--safe-top)-var(--safe-bottom)))] max-w-[480px] gap-4 overflow-hidden pb-2',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className={h2Class}>{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="pressable -mr-2.5 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink hover:bg-sunk"
            >
              <X aria-hidden="true" className="size-[22px]" />
            </Dialog.Close>
          </div>
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              Search categories
            </label>
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink2" />
            <Input
              ref={searchRef}
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={onKeyDown}
              maxLength={maxLength}
              placeholder="Search categories"
              enterKeyHint="done"
              autoComplete="off"
              className="pl-11"
            />
          </div>
          <div className="-mx-6 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function NoMatch({ query }: { query: string }) {
  return <p className="py-3 text-ink2">No categories match “{normalizeCategoryName(query)}”.</p>
}

export type CategoryFilterItem = {
  href: string
  name: string
  openMarkets: number
  markets: number
  current: boolean
}

function countText({ openMarkets, markets }: CategoryFilterItem): string {
  if (openMarkets > 0) return `${openMarkets} open`
  if (markets === 0) return 'No markets'
  return `${markets} ${markets === 1 ? 'market' : 'markets'}`
}

// Markets' category filter: one button naming the choice, opening every category busiest first
// (category_counts' order), the ones with nothing open after the rest. Each row is a link that
// keeps the tab and the search, as the chips did.
export function CategoryFilter({ allHref, items }: { allHref: string; items: CategoryFilterItem[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const current = items.find((item) => item.current)
  const searching = normalizeCategoryName(query) !== ''
  const shown = items.filter((item) => matches(item.name, query))
  const busy = shown.filter((item) => item.openMarkets > 0)
  const quiet = shown.filter((item) => item.openMarkets === 0)

  const row = (item: CategoryFilterItem) => (
    <li key={item.href}>
      <IntentLink
        href={item.href}
        aria-current={item.current ? 'page' : undefined}
        onClick={() => setOpen(false)}
        className={rowClass}
      >
        <RowContent name={item.name} current={item.current} detail={countText(item)} muted={item.openMarkets === 0} />
      </IntentLink>
    </li>
  )

  return (
    <PickerDialog
      open={open}
      onOpenChange={setOpen}
      title="Categories"
      query={query}
      onQueryChange={setQuery}
      trigger={
        <Dialog.Trigger
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'min-h-12 max-w-full min-w-0 justify-between md:min-h-11')}
        >
          <span className="min-w-0 truncate">Category: {current?.name ?? 'All'}</span>
          <ChevronDown aria-hidden="true" className="size-[18px] shrink-0 text-ink2" />
        </Dialog.Trigger>
      }
    >
      <nav aria-label="Categories">
        {!searching && (
          <ul>
            <li>
              <IntentLink
                href={allHref}
                aria-current={current ? undefined : 'page'}
                onClick={() => setOpen(false)}
                className={rowClass}
              >
                <RowContent name="All" current={!current} />
              </IntentLink>
            </li>
          </ul>
        )}
        {busy.length > 0 && <ul>{busy.map(row)}</ul>}
        {quiet.length > 0 && (
          <>
            <h3 className="pt-4 pb-1 text-sm font-bold text-ink2">Nothing open</h3>
            <ul>{quiet.map(row)}</ul>
          </>
        )}
        {searching && shown.length === 0 && <NoMatch query={query} />}
      </nav>
    </PickerDialog>
  )
}

// The Category field on Create and Edit market (0103): a button naming the choice, opening every
// visible category most used first, with a row to make the one searched for when it's new. A name
// that differs from one only in case or spacing is that one. The value goes to the server action
// through an input named `category`; a text input rather than a hidden one, since a hidden input
// can't be required. Its invalid event shows our own message beside the button instead of the
// browser's bubble over an input nobody can see.
export function CategoryPickerField({
  id,
  value,
  onChange,
  options,
  errorId,
  invalid = false,
  error,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  // Every visible category's name, most used first.
  options: string[]
  // A form's own error message the field points to, when the form shows it elsewhere.
  errorId?: string
  invalid?: boolean
  // Or the error itself, shown under the field.
  error?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [missing, setMissing] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const chosen = normalizeCategoryName(value)
  const chosenSlug = categorySlug(value)
  // A new name, or one a duplicate brought along that's since been hidden, still shows as chosen.
  const names = chosen && !options.some((name) => categorySlug(name) === chosenSlug) ? [chosen, ...options] : options
  const typed = normalizeCategoryName(query)
  const typedSlug = categorySlug(query)
  const exact = names.find((name) => categorySlug(name) === typedSlug)
  // The exact name first, so Enter picks it.
  const found = names.filter((name) => name !== exact && matches(name, query))
  const shown = exact ? [exact, ...found] : found
  const offerNew = typed !== '' && !exact
  const missingId = `${id}-missing`

  function choose(name: string) {
    onChange(name)
    setMissing(false)
    setOpen(false)
  }

  const row = (name: string) => {
    const current = categorySlug(name) === chosenSlug
    return (
      <li key={name}>
        <button type="button" aria-pressed={current} onClick={() => choose(name)} className={rowClass}>
          <RowContent name={name} current={current} />
        </button>
      </li>
    )
  }

  const ownErrorId = `${id}-error`
  const described = [`${id}-hint`, missing ? missingId : null, error ? ownErrorId : invalid ? errorId : null].filter(Boolean).join(' ')

  return (
    <Field label="Category" labelId={`${id}-label`} htmlFor={id} hint="Pick one, or search for a new one to create it.">
      <PickerDialog
        open={open}
        onOpenChange={setOpen}
        title="Choose a category"
        query={query}
        onQueryChange={setQuery}
        maxLength={TEXT_LIMITS.category}
        onEnter={() => {
          if (offerNew) choose(typed)
          else if (shown.length > 0) choose(shown[0])
        }}
        trigger={
          <Dialog.Trigger
            ref={triggerRef}
            id={id}
            aria-labelledby={`${id}-label ${id}-value`}
            aria-describedby={described}
            aria-invalid={invalid || missing || Boolean(error)}
            className="pressable flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-control border-[1.5px] border-line-s bg-surface px-3.5 text-left text-base text-ink hover:bg-sunk aria-[invalid=true]:border-2 aria-[invalid=true]:border-loss"
          >
            <span id={`${id}-value`} className={cn('min-w-0 truncate', !chosen && 'text-ink2')}>
              {chosen || 'Choose a category'}
            </span>
            <ChevronDown aria-hidden="true" className="size-[18px] shrink-0 text-ink2" />
          </Dialog.Trigger>
        }
      >
        <ul aria-label="Categories">
          {offerNew && (
            <li>
              <button type="button" onClick={() => choose(typed)} className={rowClass}>
                <Plus aria-hidden="true" className="size-5 shrink-0" />
                <span className="min-w-0 flex-1 font-bold break-words">Create “{typed}”</span>
              </button>
            </li>
          )}
          {shown.map(row)}
        </ul>
        {typed === '' && names.length === 0 && <p className="py-3 text-ink2">No categories yet. Type a name to make the first.</p>}
      </PickerDialog>
      <input
        type="text"
        name="category"
        value={chosen}
        onChange={() => {}}
        required
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onInvalid={(event) => {
          event.preventDefault()
          setMissing(true)
          triggerRef.current?.focus()
        }}
      />
      {missing ? (
        <p id={missingId} role="alert" className="text-sm font-bold text-loss">
          Choose a category, or make a new one.
        </p>
      ) : (
        error && (
          <p id={ownErrorId} role="alert" className="text-sm font-bold text-loss">
            {error}
          </p>
        )
      )}
    </Field>
  )
}
