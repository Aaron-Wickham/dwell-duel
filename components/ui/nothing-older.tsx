import { EmptyState } from '@/components/ui/empty-state'
import { BackToNewest } from '@/components/ui/show-more'

// A fresh window (a `…_from` cursor) that finds no rows: the list isn't empty, it just has nothing
// past that point any more, so it says so instead of showing the list's own empty state.
export function NothingOlder({ href }: { href: string }) {
  return <EmptyState title="Nothing older here." action={<BackToNewest href={href} />} />
}
