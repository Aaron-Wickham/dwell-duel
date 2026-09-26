import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const linkClass = cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start')

// Both links replace the history entry: the list's position lives in the URL, so a reload or a
// shared link lands on it, but each "Show more" is not a page of its own. A pushed entry would make
// Back step through every expansion, and a back-swipe on a drill-down page would slide the page
// away only to land on the same pathname (components/nav/back-swipe.tsx).
//
// `fresh` marks a "Show more" that starts a brand-new window (next.kind === 'window') rather than
// extending the current range: the rows on screen are swapped for an unrelated 50-row slice, so
// keeping the old scroll position (the default, scroll={false}) would strand the admin at the
// bottom of the new window, past its start and past "Back to newest". A fresh window scrolls like
// a normal navigation instead.
export function ShowMore({ href, fresh = false }: { href: string; fresh?: boolean }) {
  return (
    <Link href={href} scroll={fresh} replace className={linkClass}>
      Show more
    </Link>
  )
}

export function BackToNewest({ href }: { href: string }) {
  return (
    <Link href={href} replace className={linkClass}>
      Back to newest
    </Link>
  )
}
