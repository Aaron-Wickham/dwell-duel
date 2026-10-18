'use client'

import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Search, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { buttonVariants } from '@/components/ui/button'
import { MARKET_SEARCH_MAX, marketsHref } from '@/lib/markets/search'
import { cn } from '@/lib/utils'

// Markets' one filter row (#389): the status tabs, a title search and, while more than one
// category holds markets, the category button (`filters`).
//
// The search keeps the category and reads every status. It is a plain GET form that submits on
// Enter, so it works before the script loads, and a submit navigates client-side so the page
// doesn't reload. The parent keys this by the query in the URL, so Clear search and Back reset
// what's typed.
//
// On a phone the search and the category button share one row behind a button beside the tabs, so
// the first card starts in the top third; a search in the URL opens it. From md they sit on the
// tabs' row: the category button beside the tabs, the field at the right taking what's left, up to
// 320px.
export function MarketSearch({ q, category, tabs, filters }: { q: string; category: string | null; tabs: ReactNode; filters?: ReactNode }) {
  const router = useRouter()
  const [value, setValue] = useState(q)
  const [open, setOpen] = useState(q !== '')
  const [focusOnOpen, setFocusOnOpen] = useState(false)
  const id = useId()
  const panelId = `${id}-panel`

  useEffect(() => {
    if (open && focusOnOpen) document.getElementById(id)?.focus()
  }, [open, focusOnOpen, id])

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    router.push(marketsHref({ category, q: value.replace(/\s+/g, ' ').trim() }))
  }

  return (
    // From md both wrappers dissolve, so the tabs, the category button and the field share a row.
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
      <div className="flex items-center gap-2 md:contents">
        {tabs}
        <button
          type="button"
          aria-label={filters ? 'Search and filter markets' : 'Search markets'}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen((was) => !was)
            setFocusOnOpen(true)
          }}
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'size-11 shrink-0 px-0 md:hidden')}
        >
          {filters ? <SlidersHorizontal aria-hidden="true" className="size-5" /> : <Search aria-hidden="true" className="size-5" />}
        </button>
      </div>
      <div id={panelId} className={cn('items-center gap-2 md:contents', open ? 'flex' : 'hidden')}>
        {filters && <div className="flex min-w-0 shrink md:max-w-56 md:shrink-0 lg:max-w-none">{filters}</div>}
        <form
          role="search"
          action="/markets"
          method="get"
          onSubmit={onSubmit}
          className="flex min-w-40 flex-1 md:ml-auto md:max-w-80"
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
    </div>
  )
}
