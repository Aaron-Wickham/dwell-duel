'use client'

import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Search, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { buttonVariants } from '@/components/ui/button'
import { MARKET_SEARCH_MAX, marketsHref } from '@/lib/markets/search'
import { cn } from '@/lib/utils'

// Markets' one filter row (#389): the status tabs, a title search and, while more than one
// category holds markets, the category chips (`filters`).
//
// The search keeps the category chip and reads every status. It is a plain GET form that submits
// on Enter, so it works before the script loads, and a submit navigates client-side so the page
// doesn't reload. The parent keys this by the query in the URL, so Clear search and Back reset
// what's typed.
//
// On a phone the search and the chips sit behind one button beside the tabs, so the first card
// starts in the top third; a search in the URL opens them. From md the field is always there at
// the right of the row, and the chips sit beside the tabs when they fit, else under them.
export function MarketSearch({ q, category, tabs, filters }: { q: string; category: string | null; tabs: ReactNode; filters?: ReactNode }) {
  const router = useRouter()
  const [value, setValue] = useState(q)
  const [open, setOpen] = useState(q !== '')
  const [focusOnOpen, setFocusOnOpen] = useState(false)
  const id = useId()
  const formId = `${id}-form`
  const filtersId = `${id}-filters`

  useEffect(() => {
    if (open && focusOnOpen) document.getElementById(id)?.focus()
  }, [open, focusOnOpen, id])

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    router.push(marketsHref({ category, q: value.replace(/\s+/g, ' ').trim() }))
  }

  return (
    // Below md the inner wrapper dissolves, so the chips can follow the search field.
    <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:items-start md:gap-3">
      <div className="contents md:flex md:min-w-0 md:flex-1 md:flex-wrap md:items-center md:gap-3">
        {tabs}
        <button
          type="button"
          aria-label={filters ? 'Search and filter markets' : 'Search markets'}
          aria-expanded={open}
          aria-controls={filters ? `${formId} ${filtersId}` : formId}
          onClick={() => {
            setOpen((was) => !was)
            setFocusOnOpen(true)
          }}
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'size-11 shrink-0 px-0 md:hidden')}
        >
          {filters ? <SlidersHorizontal aria-hidden="true" className="size-5" /> : <Search aria-hidden="true" className="size-5" />}
        </button>
        {filters && (
          <div id={filtersId} className={cn('order-last min-w-0 basis-full md:order-none md:block md:max-w-full md:basis-auto', open ? 'block' : 'hidden')}>
            {filters}
          </div>
        )}
      </div>
      <form
        id={formId}
        role="search"
        action="/markets"
        method="get"
        onSubmit={onSubmit}
        className={cn('basis-full md:mt-0.5 md:flex md:w-80 md:shrink-0 md:basis-auto', open ? 'flex' : 'hidden')}
      >
        {category && <input type="hidden" name="category" value={category} />}
        <label htmlFor={id} className="sr-only">
          Search markets by title
        </label>
        <Input
          id={id}
          type="search"
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={MARKET_SEARCH_MAX}
          placeholder="Search markets"
          enterKeyHint="search"
          autoComplete="off"
          className="min-w-0 flex-1"
        />
      </form>
    </div>
  )
}
