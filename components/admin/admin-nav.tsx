'use client'

import { useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { SubNav } from '@/components/ui/sub-nav'
import { atLeast, type Role } from '@/lib/auth/roles'
import type { ReviewCounts } from '@/lib/admin/review-counts'

// Tasks and Markets carry their share of the Admin badge, as a badge of their own, so the
// badge's number can be found (#243, #351).
const SECTIONS: { href: string; label: string; min: Role; count?: keyof ReviewCounts }[] = [
  { href: '/admin/invites', label: 'Invites', min: 'admin' },
  { href: '/admin/tasks', label: 'Tasks', min: 'reviewer', count: 'tasks' },
  { href: '/admin/markets', label: 'Markets', min: 'admin', count: 'markets' },
  { href: '/admin/members', label: 'Members', min: 'admin' },
  { href: '/admin/ledger', label: 'Ledger', min: 'admin' },
]

export function AdminNav({ role, counts }: { role: Role; counts: ReviewCounts }) {
  const pathname = usePathname()
  const scroller = useRef<HTMLDivElement>(null)
  const sections = SECTIONS.filter((s) => atLeast(role, s.min))
  // On a phone the current tab may sit past the edge (Ledger at 320px), so the row starts scrolled
  // to show it.
  useLayoutEffect(() => {
    const row = scroller.current
    const current = row?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!row || !current || row.scrollWidth <= row.clientWidth) return
    const past = current.getBoundingClientRect().right - row.getBoundingClientRect().right + 16
    if (past > 0) row.scrollLeft += past
  }, [pathname])
  // A reviewer has only the approval queue; a one-tab switcher would just be noise.
  if (sections.length < 2) return null

  // Five tabs don't fit 320px (ST-13), so below md the row scrolls sideways, edge to edge, with the
  // page's 16px gutter as padding, rather than clipping Ledger. Each tab keeps 16px a side, so a
  // badge hanging off its label's corner never reaches the next label.
  return (
    <div ref={scroller} className="-mx-4 overflow-x-auto overscroll-x-contain px-4 md:mx-0 md:overflow-visible md:px-0">
      <SubNav
        label="Admin sections"
        className="w-max min-w-full [&>a]:px-4 md:w-fit md:min-w-0"
        items={sections.map(({ href, label, count }) => ({
          href,
          label,
          badge: count ? counts[count] : 0,
          current: pathname === href,
        }))}
      />
    </div>
  )
}
