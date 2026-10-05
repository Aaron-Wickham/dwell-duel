'use client'

import { useId, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { MARKET_SEARCH_MAX, marketsHref } from '@/lib/markets/search'
import type { MarketFilter } from '@/lib/markets/status-filter'

// A title search that keeps the status tab and the category chip. It is a plain GET form, so it
// works before the script loads, and a submit navigates client-side so the page doesn't reload. The
// parent keys it by the query in the URL, so Clear search and Back reset what's typed.
export function MarketSearch({ q, status, category }: { q: string; status: MarketFilter; category: string | null }) {
  const router = useRouter()
  const [value, setValue] = useState(q)
  const id = useId()

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    router.push(marketsHref({ status, category, q: value.replace(/\s+/g, ' ').trim() }))
  }

  return (
    <form role="search" action="/markets" method="get" onSubmit={onSubmit} className="order-1 flex w-full items-start gap-2 md:max-w-[520px] md:flex-1">
      {status !== 'all' && <input type="hidden" name="status" value={status} />}
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
        placeholder="Search by title"
        enterKeyHint="search"
        autoComplete="off"
        className="min-w-0 flex-1"
      />
      <Button type="submit" variant="secondary" className="min-h-12 shrink-0">
        Search
      </Button>
    </form>
  )
}
