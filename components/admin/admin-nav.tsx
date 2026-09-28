'use client'

import { usePathname } from 'next/navigation'
import { SubNav } from '@/components/ui/sub-nav'
import { atLeast, type Role } from '@/lib/auth/roles'

const SECTIONS: { href: string; label: string; min: Role }[] = [
  { href: '/admin/invites', label: 'Invites', min: 'admin' },
  { href: '/admin/tasks', label: 'Tasks', min: 'reviewer' },
  { href: '/admin/members', label: 'Members', min: 'admin' },
  { href: '/admin/ledger', label: 'Ledger', min: 'admin' },
]

export function AdminNav({ role }: { role: Role }) {
  const pathname = usePathname()
  const sections = SECTIONS.filter((s) => atLeast(role, s.min))
  // A reviewer has only the approval queue; a one-tab switcher would just be noise.
  if (sections.length < 2) return null

  return (
    <SubNav
      label="Admin sections"
      items={sections.map(({ href, label }) => ({ href, label, current: pathname === href }))}
    />
  )
}
