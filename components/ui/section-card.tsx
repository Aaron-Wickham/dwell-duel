import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { cardClass } from '@/components/ui/card'
import { h2Class } from '@/components/ui/page'

export function SectionCard({
  title,
  titleId,
  action,
  className,
  children,
}: {
  title: ReactNode
  titleId: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  const heading = (
    <h2 id={titleId} className={h2Class}>
      {title}
    </h2>
  )
  return (
    <section aria-labelledby={titleId} className={cn(cardClass, 'flex flex-col gap-3 p-[18px] md:p-6', className)}>
      {action ? (
        <div className="flex items-center justify-between gap-3">
          {heading}
          {action}
        </div>
      ) : (
        heading
      )}
      {children}
    </section>
  )
}
