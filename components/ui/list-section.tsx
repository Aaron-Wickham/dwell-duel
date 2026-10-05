import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { h2Class } from '@/components/ui/page'

// A list that is a page's only content (D2, #386): a named region with no card around it, so its
// ListCards or rows sit on the page. `titleHidden` is only for a heading that would repeat the h1 or
// the current tab; it still gives a screen reader the region.
export function ListSection({
  title,
  titleId,
  titleHidden = false,
  description,
  action,
  className,
  children,
}: {
  title: ReactNode
  titleId: string
  titleHidden?: boolean
  description?: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  const heading = (
    <h2 id={titleId} className={titleHidden ? 'sr-only' : h2Class}>
      {title}
    </h2>
  )
  const head = titleHidden ? (
    heading
  ) : (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        {heading}
        {description && <p className="text-sm text-ink2">{description}</p>}
      </div>
      {action}
    </div>
  )
  return (
    <section aria-labelledby={titleId} className={cn('flex flex-col gap-3', className)}>
      {head}
      {children}
    </section>
  )
}
