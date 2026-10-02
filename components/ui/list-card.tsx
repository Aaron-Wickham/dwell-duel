import type { LiHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// A list of cards inside a SectionCard: spaced, never divided (#328).
export const listCardsClass = 'flex flex-col gap-2'

// The My bets parlay card's look: a hairline and no shadow, since it already sits in a card.
export const listCardClass = 'rounded-tile border border-line p-3.5 md:p-4'

// Tints flush to the border instead of lifting: a card floating in a card reads as a button in a
// button (#244).
export const tappableListCardClass = cn(listCardClass, 'pressable hover-tint relative [--tint-inset:0] before:rounded-[inherit]')

// A list item that opens one thing: its title is a `stretched-link`, and any other control sits in
// a `relative z-[1]` wrapper. `tappable={false}` is a card that opens nothing, only holding its own
// controls (a task's Submit, a submission's Approve), so it doesn't press.
export function ListCard({ tappable = true, className, ...props }: LiHTMLAttributes<HTMLLIElement> & { tappable?: boolean }) {
  return <li className={cn(tappable ? tappableListCardClass : listCardClass, className)} {...props} />
}
