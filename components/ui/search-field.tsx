'use client'

import { useState } from 'react'
import Form from 'next/form'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { SEARCH_MAX } from '@/lib/search/query'

// A search box whose query lives in the URL's ?q=: a GET form that navigates in place, keeping the
// other filters given in `keep` (a tab, say) and dropping any "Show more" position, since a new
// search starts its list from the top. Controlled, and re-keyed on `value`, so it shows the query
// the page was rendered for, including after "Clear search".
export function SearchField({
  action,
  label,
  placeholder,
  value,
  keep = {},
}: {
  action: string
  label: string
  placeholder: string
  value: string
  keep?: Record<string, string>
}) {
  return <SearchForm key={value} action={action} label={label} placeholder={placeholder} value={value} keep={keep} />
}

function SearchForm({
  action,
  label,
  placeholder,
  value,
  keep,
}: {
  action: string
  label: string
  placeholder: string
  value: string
  keep: Record<string, string>
}) {
  const [text, setText] = useState(value)
  const id = `search-${action.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`

  return (
    <Form action={action} replace scroll={false} role="search" className="flex min-w-0 gap-2">
      {Object.entries(keep).map(([name, v]) => (
        <input key={name} type="hidden" name={name} value={v} />
      ))}
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <span className="relative min-w-0 grow">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink2" />
        <Input
          id={id}
          name="q"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          maxLength={SEARCH_MAX}
          autoComplete="off"
          className="pl-11"
        />
      </span>
      <Button type="submit" variant="secondary" className="shrink-0">
        Search
      </Button>
    </Form>
  )
}
