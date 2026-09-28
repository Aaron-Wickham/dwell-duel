'use client'

import { useId } from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { requestShowMoreFocus } from '@/components/ui/show-more-focus'
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
//
// `focusId` is the DOM id of the first row the link will show (rowDomId of next.firstId). The
// link itself leaves the page or moves, so focus would otherwise fall back to the document; the
// page's ShowMoreFocus moves it to that row once it renders.
// `description` names the list when a page has more than one "Show more" (the markets list's open
// and closed lists), so they're distinguishable out of context while their name stays "Show more".
export function ShowMore({
  href,
  fresh = false,
  focusId,
  description,
}: {
  href: string
  fresh?: boolean
  focusId?: string
  description?: string
}) {
  const descriptionId = useId()
  return (
    <>
      <Link
        href={href}
        scroll={fresh}
        replace
        className={linkClass}
        aria-describedby={description ? descriptionId : undefined}
        onNavigate={focusId ? () => requestShowMoreFocus(focusId) : undefined}
      >
        Show more
      </Link>
      {description && (
        <span id={descriptionId} hidden>
          {description}
        </span>
      )}
    </>
  )
}

export function BackToNewest({ href }: { href: string }) {
  return (
    <Link href={href} replace className={linkClass}>
      Back to newest
    </Link>
  )
}
