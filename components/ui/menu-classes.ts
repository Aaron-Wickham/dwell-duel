import { uiTextClass } from '@/components/ui/page'

// One look for every Base UI menu item (the avatar's menu, a market's More actions). The highlight
// Base UI moves with the arrow keys is the tab-active tint, but a tint alone is about 1.2:1 on the
// popup, so an item focused from the keyboard (Base UI moves real focus) also takes an inset focus
// ring. Under the mouse it stays a tint, like a row's hover.
export const menuItemClass = `pressable flex min-h-11 items-center gap-3 rounded-segment px-3 ${uiTextClass} font-bold text-ink no-underline outline-none select-none data-highlighted:bg-tab-active data-highlighted:text-on-tab-active focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus`
