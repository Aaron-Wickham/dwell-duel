import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export interface HomeTile {
  id: string
  href: string
  icon: LucideIcon
  title: string
  subtitle: string
}

export function HomeTiles({ tiles }: { tiles: HomeTile[] }) {
  return (
    <nav aria-label="Everything in DwellDuel">
      <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface px-1 lg:grid lg:grid-cols-3 lg:gap-5 lg:divide-y-0 lg:border-0 lg:bg-transparent lg:px-0">
        {tiles.map(({ id, href, icon: Icon, title, subtitle }) => (
          <Link
            key={id}
            href={href}
            transitionTypes={id === 'admin' ? ['nav-forward'] : undefined}
            className="pressable group flex min-h-[72px] items-center gap-3.5 px-4 py-3 text-ink no-underline lg:min-h-24 lg:rounded-card lg:border lg:border-line lg:bg-surface lg:p-5 lg:shadow-card"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-acc-soft text-acc-text">
              <Icon aria-hidden="true" className="size-[22px]" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[17px] leading-[1.25] font-extrabold group-hover:underline group-hover:underline-offset-[3px]">
                {title}
              </span>
              <span className="text-sm text-ink2">{subtitle}</span>
            </span>
            <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink" />
          </Link>
        ))}
      </div>
    </nav>
  )
}
