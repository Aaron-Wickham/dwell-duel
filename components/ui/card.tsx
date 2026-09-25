import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const cardClass = 'rounded-card border border-line bg-surface shadow-card'

export function Card({ className, padded = true, ...props }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={cn(cardClass, padded && 'p-[18px] md:p-6', className)} {...props} />
}
