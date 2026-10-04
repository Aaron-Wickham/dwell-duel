import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const cardClass = 'rounded-card border border-line bg-surface shadow-card'
// A card's inner padding, shared by Card, SectionCard and every card built by hand.
export const cardPaddingClass = 'p-[18px] md:p-6'

export function Card({ className, padded = true, ...props }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={cn(cardClass, padded && cardPaddingClass, className)} {...props} />
}
