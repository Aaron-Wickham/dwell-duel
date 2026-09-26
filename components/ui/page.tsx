import type { ReactNode } from 'react'
import { ContentReveal } from '@/components/nav/page-transition'
import { cn } from '@/lib/utils'

export const h1Class = 'text-[28px] font-extrabold leading-[1.12] tracking-[-0.025em] text-balance md:text-[40px]'
export const h2Class = 'text-[19px] font-extrabold leading-[1.25] tracking-[-0.01em] md:text-[21px]'
export const eyebrowClass = 'text-xs font-extrabold uppercase tracking-[0.09em] text-ink2'

export const pageClass =
  'mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-5 px-4 pt-5 pb-8 md:gap-7 md:px-20 md:pt-10 md:pb-20'

export function Page({
  className,
  reveal = false,
  children,
}: {
  className?: string
  reveal?: boolean
  children: ReactNode
}) {
  const page = <div className={cn(pageClass, className)}>{children}</div>
  return reveal ? <ContentReveal>{page}</ContentReveal> : page
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
