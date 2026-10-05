import type { LiHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// One container per list (D2, #386, superseding #328's cards inside a SectionCard): a list that is
// a page's only content sits straight on the page as ListCards, spaced, never divided; a list inside
// a SectionCard is `dividedRowsClass` rows, never bordered cards inside the card.
export const listCardsClass = 'flex flex-col gap-2'

// A hairline and no shadow: the cards sit side by side on the page, so none of them floats.
export const listCardClass = 'rounded-tile border border-line p-3.5 md:p-4'

// Tints flush to the border instead of lifting (#244).
export const tappableListCardClass = cn(listCardClass, 'pressable hover-tint relative [--tint-inset:0] before:rounded-[inherit]')

// A list inside a SectionCard (D2): hairlines between rows, at the feed's and ledger's row spacing. A
// row that opens one thing adds `pressable hover-tint relative` and a `stretched-link` title.
export const dividedRowsClass = 'flex flex-col divide-y divide-line'
export const dividedRowClass = 'py-3.5'

// A list item that opens one thing: its title is a `stretched-link`, and any other control sits in
// a `relative z-[1]` wrapper. `tappable={false}` is a card that opens nothing, only holding its own
// controls (a task's Submit), so it doesn't press.
export function ListCard({ tappable = true, className, ...props }: LiHTMLAttributes<HTMLLIElement> & { tappable?: boolean }) {
  return <li className={cn(tappable ? tappableListCardClass : listCardClass, className)} {...props} />
}
