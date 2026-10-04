import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export type FilterChip = { href: string; label: string; current: boolean }

export function filterChipClass(current: boolean): string {
  return cn(
    'pressable inline-flex min-h-11 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border-[1.5px] px-4 text-[15px] font-bold no-underline',
    current ? 'border-nav-active bg-nav-active text-on-nav-active' : 'border-line-s bg-surface text-ink hover:bg-sunk',
  )
}

// A row of single-choice filters kept in the URL, lighter than a SubNav's tabs: they narrow the
// list a tab already picked. The chosen chip is filled; each is a real link, so a chip works
// without script and a view can be shared. `scroll` keeps a long row on one line that scrolls
// sideways on a phone, wrapping from md; `children` follow the chips, as Markets' More… does.
export function FilterChips({
  label,
  items,
  className,
  scroll = false,
  children,
}: {
  label: string
  items: FilterChip[]
  className?: string
  scroll?: boolean
  children?: ReactNode
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        'no-callout flex items-center gap-2',
        scroll ? '-mx-4 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0' : 'flex-wrap',
        className,
      )}
    >
      {items.map(({ href, label: itemLabel, current }) => (
        <Link key={href} href={href} aria-current={current ? 'page' : undefined} className={filterChipClass(current)}>
          {itemLabel}
        </Link>
      ))}
      {children}
    </nav>
  )
}
