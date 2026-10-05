import type { ReactNode } from 'react'
import { BackSwipe } from '@/components/nav/back-swipe'
import { DrillDownTransition, TabTransition } from '@/components/nav/page-transition'
import { cn } from '@/lib/utils'

export const h1Class = 'text-[28px] font-extrabold leading-[1.12] tracking-[-0.025em] text-balance md:text-[40px]'
export const h2Class = 'text-[19px] font-extrabold leading-[1.25] tracking-[-0.01em] md:text-[21px]'
export const eyebrowClass = 'text-xs font-extrabold uppercase tracking-[0.09em] text-ink2'
// The title of a row or tile in a list: task rows, bet rows, leaderboard rows and the like.
export const rowTitleClass = 'text-[17px] font-extrabold leading-[1.3] tracking-[-0.01em]'
// The name of a form field: a <label> above its control, or a <legend> over a group of them.
export const labelClass = 'text-[15px] font-bold'
// Figures: a number that is the point of its card. The hero is Home's balance and a parlay's
// summary; a stat sits in a stat card or the chart's legend; an inline figure sits in a dense grid
// or beside other text.
export const figureHeroClass = 'text-[40px] font-extrabold leading-none tracking-[-0.03em] md:text-[56px]'
export const figureClass = 'text-[24px] font-extrabold leading-tight tracking-[-0.02em] md:text-[28px]'
export const figureInlineClass = 'text-[20px] font-extrabold leading-tight'
// The sizes between body and caption. UI text is a control's, a label's or a message's (buttons,
// tabs, filter chips, the nav, tables); chip text is a status or category chip's; micro text is a
// count badge's or a chart axis's.
export const uiTextClass = 'text-[15px]'
export const chipTextClass = 'text-[13px]'
export const microTextClass = 'text-[11px]'

// `wide` gives a 1120px content column inside md:px-20; `reading` gives about 820px, centred, for a
// single stream or long text, so the header, tabs and content always share one pair of edges.
const pageWidths = { wide: 'max-w-[1280px]', reading: 'max-w-[980px]' } as const
export type PageWidth = keyof typeof pageWidths

export function pageClassFor(width: PageWidth = 'wide'): string {
  return cn(
    'mx-auto flex w-full flex-1 flex-col gap-5 px-4 pt-5 pb-8 md:gap-7 md:px-20 md:pt-10 md:pb-20',
    pageWidths[width],
  )
}

export const pageClass = pageClassFor('wide')

export function Page({
  className,
  transition,
  width = 'wide',
  children,
}: {
  className?: string
  transition?: 'tab' | 'drill-down'
  width?: PageWidth
  children: ReactNode
}) {
  const page = <div className={cn(pageClassFor(width), className)}>{children}</div>
  if (transition === 'tab') return <TabTransition>{page}</TabTransition>
  if (transition === 'drill-down') {
    return (
      <DrillDownTransition>
        <BackSwipe>{page}</BackSwipe>
      </DrillDownTransition>
    )
  }
  return page
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className={h1Class}>{title}</h1>
        {description && <p className="text-ink2">{description}</p>}
      </div>
      {action}
    </div>
  )
}
