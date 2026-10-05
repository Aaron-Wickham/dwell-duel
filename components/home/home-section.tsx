import type { ReactNode } from 'react'
import { IntentLink } from '@/components/ui/intent-link'
import { TAB_TRANSITION } from '@/components/nav/page-transition'
import { h2Class, uiTextClass } from '@/components/ui/page'
import { cn } from '@/lib/utils'

// Home's sections are rows on the page on a phone and cards from lg (#388, the P1004-Home boards):
// one markup for both, and the skeleton shares the class.
export const homeSectionClass = 'flex flex-col gap-1 lg:rounded-card lg:border lg:border-line lg:bg-surface lg:p-6 lg:shadow-card'

// A divided list of rows inside a section.
export const homeRowsClass = 'flex flex-col divide-y divide-line'

export function HomeSection({
  title,
  titleId,
  action,
  className,
  children,
}: {
  title: string
  titleId: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={titleId} className={cn(homeSectionClass, className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={titleId} className={h2Class}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

// A section's way to the whole list: a tab (My bets) swaps, a drill-down (Activity) slides.
export function SeeAll({ href, label = 'See all', drillDown = false }: { href: string; label?: string; drillDown?: boolean }) {
  return (
    <IntentLink
      href={href}
      transitionTypes={drillDown ? ['nav-forward'] : TAB_TRANSITION}
      className={`pressable hit-area shrink-0 font-bold ${uiTextClass}`}
    >
      {label}
    </IntentLink>
  )
}
