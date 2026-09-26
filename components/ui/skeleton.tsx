import type { ReactNode } from 'react'
import { cardClass } from '@/components/ui/card'
import { SkeletonReveal } from '@/components/nav/page-transition'
import { cn } from '@/lib/utils'

// The sunk fill, control radius and shimmer come from the .skeleton rule in app/globals.css, a
// component layer, so a bg-* or rounded-* utility in className overrides them.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('skeleton', className)} />
}

export function SkeletonScreen({ name, className, children }: { name: string; className?: string; children: ReactNode }) {
  return (
    <SkeletonReveal>
      <div data-skeleton={name} className={className}>
        <p role="status" className="sr-only">
          Loading…
        </p>
        {children}
      </div>
    </SkeletonReveal>
  )
}

export function SkeletonCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(cardClass, 'flex flex-col gap-3 p-[18px] md:p-6', className)}>{children}</div>
}

export function SkeletonPageHeader({ description = false, action = false }: { description?: boolean; action?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 grow flex-col gap-2">
        <Skeleton className="h-8 w-44 md:h-11 md:w-64" />
        {description && <Skeleton className="h-5 w-full max-w-[420px]" />}
      </div>
      {action && <Skeleton className="h-11 w-36 shrink-0 md:h-12 md:w-44" />}
    </div>
  )
}

export function SkeletonField({ className, tall = false }: { className?: string; tall?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Skeleton className="h-5 w-24" />
      <Skeleton className={tall ? 'h-[100px]' : 'h-12'} />
    </div>
  )
}
