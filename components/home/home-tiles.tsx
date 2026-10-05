import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { TAB_TRANSITION } from '@/components/nav/page-transition'
import { ChevronRight } from 'lucide-react'
import { listCardsClass, tappableListCardClass } from '@/components/ui/list-card'
import { rowTitleClass } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import { cardPaddingClass } from '@/components/ui/card'

export interface HomeTile {
  id: string
  href: string
  icon: LucideIcon
  title: string
  subtitle: string
}

// Tiles into a drill-down page slide forward; the rest are tabs.
const DRILL_DOWN_TILES = new Set(['admin'])

// Below lg the tiles are list cards inside one card, so they sit on hover-tint's flat panel; from
// lg each is a card of its own and lifts as one.
const TILE_CLASS = cn(
  tappableListCardClass,
  'group flex min-h-[72px] items-center gap-3.5 text-ink no-underline lg:hover-lift lg:before:hidden lg:min-h-24 lg:rounded-card lg:bg-surface lg:p-5 lg:shadow-card',
)

function TileBody({ icon: Icon, title, subtitle }: Pick<HomeTile, 'icon' | 'title' | 'subtitle'>) {
  return (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-acc-soft text-acc-text">
        <Icon aria-hidden="true" className="size-[22px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn(rowTitleClass, 'group-hover:underline group-hover:underline-offset-[3px]')}>{title}</span>
        <span className="text-sm text-ink2">{subtitle}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink" />
    </>
  )
}

export function HomeTiles({ tiles }: { tiles: HomeTile[] }) {
  return (
    <nav aria-label="Everything in DwellDuel">
      <h2 className="sr-only">Go to</h2>
      <div className={cn(listCardsClass, `rounded-card border border-line bg-surface ${cardPaddingClass} lg:grid lg:grid-cols-3 lg:gap-5 lg:border-0 lg:bg-transparent lg:p-0`)}>
        {tiles.map((tile) =>
          // The mail app opens outside DwellDuel, so this is a real <a>, not a routed <Link> --
          // no transitionTypes, and no client-side navigation to cancel or wait on.
          tile.href.startsWith('mailto:') ? (
            <a key={tile.id} href={tile.href} className={TILE_CLASS}>
              <TileBody icon={tile.icon} title={tile.title} subtitle={tile.subtitle} />
            </a>
          ) : (
            <Link
              key={tile.id}
              href={tile.href}
              transitionTypes={DRILL_DOWN_TILES.has(tile.id) ? ['nav-forward'] : TAB_TRANSITION}
              className={TILE_CLASS}
            >
              <TileBody icon={tile.icon} title={tile.title} subtitle={tile.subtitle} />
            </Link>
          ),
        )}
      </div>
    </nav>
  )
}
