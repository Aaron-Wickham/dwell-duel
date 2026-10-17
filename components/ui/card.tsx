import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// One surface language (#441): a card is a step lighter than the page, with no border and no
// resting shadow. Only what truly floats (a sheet, a menu, a lifted card under the mouse) casts one.
export const cardClass = 'rounded-card bg-surface'
// A card's inner padding, shared by Card, SectionCard and every card built by hand.
export const cardPaddingClass = 'p-[18px] md:p-6'

export function Card({ className, padded = true, ...props }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={cn(cardClass, padded && cardPaddingClass, className)} {...props} />
}
