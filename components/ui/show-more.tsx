import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const linkClass = cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start')

// Both links replace the history entry: the list's position lives in the URL, so a reload or a
// shared link lands on it, but each "Show more" is not a page of its own. A pushed entry would make
// Back step through every expansion, and a back-swipe on a drill-down page would slide the page
// away only to land on the same pathname (components/nav/back-swipe.tsx).
export function ShowMore({ href }: { href: string }) {
  return (
    <Link href={href} scroll={false} replace className={linkClass}>
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
