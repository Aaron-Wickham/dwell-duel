import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { cardClass } from '@/components/ui/card'
import { h2Class } from '@/components/ui/page'

export function SectionCard({
  title,
  titleId,
  description,
  action,
  className,
  children,
}: {
  title: ReactNode
  titleId: string
  // A line under the heading, closer to it than the card's gap puts the content.
  description?: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  const heading = (
    <h2 id={titleId} className={h2Class}>
      {title}
    </h2>
  )
  const head = description ? (
    <div className="flex min-w-0 flex-col gap-1">
      {heading}
      <p className="text-sm text-ink2">{description}</p>
    </div>
  ) : (
    heading
  )
  return (
    <section aria-labelledby={titleId} className={cn(cardClass, 'flex flex-col gap-3 p-[18px] md:p-6', className)}>
      {action ? (
        <div className="flex items-center justify-between gap-3">
          {head}
          {action}
        </div>
      ) : (
        head
      )}
      {children}
    </section>
  )
}
