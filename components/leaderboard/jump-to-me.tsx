'use client'

import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { requestShowMoreFocus } from '@/components/ui/show-more-focus'

// Replaces the history entry like "Show more" does: where a list is open is the URL's business, not a
// page of its own. `focusId` is the member's own row, which the page's ShowMoreFocus moves focus to.
export function JumpToMe({ href, focusId }: { href: string; focusId: string }) {
  return (
    <Link
      href={href}
      scroll
      replace
      onNavigate={() => requestShowMoreFocus(focusId)}
      className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} shrink-0`}
    >
      Jump to me
    </Link>
  )
}
