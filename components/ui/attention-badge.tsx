import { cn } from '@/lib/utils'
import { chipTextClass, microTextClass } from '@/components/ui/page'

// A count of what waits on the viewer (tasks to review, markets to resolve), on the top bar's
// Admin button and on the admin section tabs that make up its number (#243, #351). Decorative to
// assistive tech: an AttentionNote beside it carries the number.
export function AttentionBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      aria-hidden="true"
      className={cn(
        `pointer-events-none absolute flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-loss px-1 ${microTextClass} leading-none font-extrabold text-on-primary ring-2 ring-surface`,
        className,
      )}
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}

// Read after the control's name, through aria-describedby, so the name stays plain ("Admin",
// "Markets") and is found the same way with or without work waiting.
export function AttentionNote({ id, count }: { id: string; count: number }) {
  if (count <= 0) return null
  return (
    <span id={id} className="sr-only">
      {`${count} waiting`}
    </span>
  )
}

// The same count as a word in a row's text, where there's room to say it ("3 waiting"): the avatar
// menu's Admin item.
export function AttentionCount({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        `inline-flex h-6 shrink-0 items-center rounded-full bg-loss px-2 ${chipTextClass} leading-none font-extrabold whitespace-nowrap text-on-primary`,
        className,
      )}
    >
      {`${count} waiting`}
    </span>
  )
}
