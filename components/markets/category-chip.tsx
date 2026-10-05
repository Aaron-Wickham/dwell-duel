import { cn } from '@/lib/utils'
import { chipTextClass } from '@/components/ui/page'

// A market's category (0103), outlined so it doesn't read as a status. Tapping it does nothing yet.
export function CategoryChip({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        `no-callout inline-flex h-7 max-w-full items-center rounded-full border border-line px-2.5 ${chipTextClass} font-bold text-ink2`,
        className,
      )}
    >
      <span className="sr-only">Category: </span>
      <span className="truncate">{name}</span>
    </span>
  )
}
