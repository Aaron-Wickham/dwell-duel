import { cn } from '@/lib/utils'
import { chipTextClass } from '@/components/ui/page'
import { tintFor } from '@/lib/ui/tint'

// A market's category (0103), a soft tint picked from its name (#445): a category keeps its colour
// everywhere, and the tints are apart from the status colours. Tapping it does nothing yet.
export function CategoryChip({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        `no-callout inline-flex h-7 max-w-full items-center rounded-full px-2.5 ${chipTextClass} font-bold`,
        tintFor(name),
        className,
      )}
    >
      <span className="sr-only">Category: </span>
      <span className="truncate">{name}</span>
    </span>
  )
}
