'use client'

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
  const sections = SECTIONS.filter((s) => atLeast(role, s.min))
  // A reviewer has only the approval queue; a one-tab switcher would just be noise.
  if (sections.length < 2) return null

  return (
    <SubNav
      label="Admin sections"
      items={sections.map(({ href, label, count }) => ({
        href,
        label,
        badge: count ? counts[count] : 0,
        current: pathname === href,
      }))}
    />
  )
}
