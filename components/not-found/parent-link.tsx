'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { logicalParent } from '@/lib/nav/back-swipe'

const PARENT_NAMES: Record<string, string> = {
  '/markets': 'Markets',
  '/leaderboard': 'Leaderboard',
  '/bets': 'My bets',
  '/how-it-works': 'How it works',
  '/admin/members': 'Members',
}

// A missing market or member leaves the member one step from where they were, the same parent the
// back-swipe goes to, rather than only at Home. Nothing when that parent is Home itself.
export function NotFoundParentLink() {
  const pathname = usePathname()
  const parent = pathname ? logicalParent(pathname) : '/'
  const name = PARENT_NAMES[parent]
  if (!name) return null
  return (
    <Link href={parent} transitionTypes={['nav-back']} className={buttonVariants({ variant: 'secondary' })}>
      Back to {name}
    </Link>
  )
}
