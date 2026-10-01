import Link from 'next/link'
import { cn } from '@/lib/utils'

export type FilterChip = { href: string; label: string; current: boolean }

// A row of single-choice filters kept in the URL, lighter than a SubNav's tabs: they narrow the
// list a tab already picked. The chosen chip is filled; each is a real link, so a chip works
// without script and a view can be shared.
export function FilterChips({ label, items, className }: { label: string; items: FilterChip[]; className?: string }) {
  return (
    <nav aria-label={label} className={cn('no-callout flex flex-wrap items-center gap-2', className)}>
      {items.map(({ href, label: itemLabel, current }) => (
        <Link
          key={href}
          href={href}
          aria-current={current ? 'page' : undefined}
          className={cn(
            'pressable inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-[15px] font-bold no-underline',
            current ? 'border-primary bg-primary text-on-primary' : 'border-line-s bg-surface text-ink hover:bg-sunk',
          )}
        >
          {itemLabel}
        </Link>
      ))}
    </nav>
  )
}
