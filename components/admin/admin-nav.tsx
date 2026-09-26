'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const SECTIONS = [
  { href: '/admin/invites', label: 'Invites' },
  { href: '/admin/tasks', label: 'Tasks' },
  { href: '/admin/members', label: 'Members' },
  { href: '/admin/ledger', label: 'Ledger' },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Admin sections" className="no-callout flex gap-1 rounded-[14px] bg-sunk p-1 md:self-start">
      {SECTIONS.map(({ href, label }) => {
        const current = pathname === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'pressable inline-flex min-h-11 grow items-center justify-center rounded-[10px] px-2 text-[15px] font-bold no-underline md:grow-0 md:px-4',
              current ? 'bg-surface text-ink shadow-tab' : 'text-ink2 hover:text-ink',
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
