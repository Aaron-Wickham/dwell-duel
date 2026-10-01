import Link from 'next/link'

// The line under a search box once a search has run: how many rows match, and a way back to the
// whole list. `count` is the open tab's.
export function SearchSummary({ count, noun, query, clearHref }: { count: number; noun: [string, string]; query: string; clearHref: string }) {
  const [one, many] = noun
  return (
    <p className="text-sm text-ink2">
      {count.toLocaleString('en-US')} {count === 1 ? `${one} matches` : `${many} match`} “{query}”.{' '}
      <Link href={clearHref} replace scroll={false}>
        Clear search
      </Link>
    </p>
  )
}
