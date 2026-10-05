'use client'

import { useEffect, useState } from 'react'
import { eyebrowClass } from '@/components/ui/page'
import { cn } from '@/lib/utils'

export interface ContentsItem {
  id: string
  label: string
}

// The full rules' sticky contents list at lg, marking the section being read (#398): the first
// section that crosses the top third of the screen, below the top bar. Only a colour and a border
// change, so it moves nothing under reduced motion either.
export function RulesContents({ items }: { items: ContentsItem[] }) {
  const [current, setCurrent] = useState<string | null>(items[0]?.id ?? null)

  useEffect(() => {
    const sections = items.map((item) => document.getElementById(item.id)?.closest('section')).filter((s): s is HTMLElement => !!s)
    if (sections.length === 0 || typeof IntersectionObserver === 'undefined') return
    const inBand = new Set<Element>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target)
          else inBand.delete(entry.target)
        }
        const heading = sections.find((section) => inBand.has(section))?.querySelector('h2')
        if (heading) setCurrent(heading.id)
      },
      { rootMargin: '-96px 0px -66% 0px' },
    )
    for (const section of sections) observer.observe(section)
    return () => observer.disconnect()
  }, [items])

  return (
    <nav aria-labelledby="how-contents" className="hidden lg:sticky lg:top-[calc(72px+var(--safe-top)+24px)] lg:flex lg:flex-col lg:gap-2">
      <p id="how-contents" className={eyebrowClass}>
        Contents
      </p>
      <ul className="flex flex-col">
        {items.map((item) => {
          const active = item.id === current
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? 'location' : undefined}
                className={cn(
                  'pressable flex min-h-11 items-center border-l-[3px] py-1 pl-3 font-bold no-underline',
                  active ? 'border-ink text-ink' : 'border-transparent text-ink2',
                )}
              >
                {item.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
