import Link from 'next/link'
import { cn } from '@/lib/utils'

export type SubNavItem = { href: string; label: string; current: boolean }

// The mockup's segmented `.subnav`: full width on a phone, hugging its tabs from md.
export function SubNav({ label, items }: { label: string; items: SubNavItem[] }) {
  return (
    <nav aria-label={label} className="no-callout flex gap-1 rounded-[14px] bg-sunk p-1 md:self-start">
      {items.map(({ href, label: itemLabel, current }) => (
        <Link
          key={href}
          href={href}
          aria-current={current ? 'page' : undefined}
          className={cn(
            'pressable inline-flex min-h-11 grow items-center justify-center rounded-[10px] px-2 text-[15px] font-bold no-underline md:grow-0 md:px-4',
            current ? 'bg-surface text-ink shadow-tab' : 'text-ink2 hover:text-ink',
          )}
        >
          {itemLabel}
        </Link>
      ))}
    </nav>
  )
}
