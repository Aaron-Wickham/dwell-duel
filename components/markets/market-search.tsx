'use client'

import { useEffect, useId, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { buttonVariants } from '@/components/ui/button'
import { MARKET_SEARCH_MAX, marketsHref } from '@/lib/markets/search'
import { cn } from '@/lib/utils'

// A title search that keeps the category chip, and reads every status. It is a plain GET form
// that submits on Enter, so it works before the script loads, and a submit navigates client-side
// so the page doesn't reload. The parent keys it by the query in the URL, so Clear search and
// Back reset what's typed.
//
// On a phone it sits behind an icon button beside the status tabs, so the list starts higher;
// from md the field is always there, at the right of the same row. A search in the URL opens it.
export function MarketSearch({ q, category }: { q: string; category: string | null }) {
  const router = useRouter()
  const [value, setValue] = useState(q)
  const [open, setOpen] = useState(q !== '')
  const [focusOnOpen, setFocusOnOpen] = useState(false)
  const id = useId()
  const formId = `${id}-form`

  useEffect(() => {
    if (open && focusOnOpen) document.getElementById(id)?.focus()
  }, [open, focusOnOpen, id])

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    router.push(marketsHref({ category, q: value.replace(/\s+/g, ' ').trim() }))
  }

  return (
    <>
      <button
        type="button"
        aria-label="Search markets"
        aria-expanded={open}
        aria-controls={formId}
        onClick={() => {
          setOpen((was) => !was)
          setFocusOnOpen(true)
        }}
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'size-11 shrink-0 px-0 md:hidden')}
      >
        <Search aria-hidden="true" className="size-5" />
      </button>
      <form
        id={formId}
        role="search"
        action="/markets"
        method="get"
        onSubmit={onSubmit}
        className={cn('basis-full md:ml-auto md:flex md:w-80 md:basis-auto', open ? 'flex' : 'hidden')}
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
    </>
  )
}
