'use client'

import { useLayoutEffect, useRef } from 'react'
import Link from 'next/link'
import { reducedMotion } from '@/lib/ui/reduced-motion'
import { cn } from '@/lib/utils'

export type SubNavItem = { href: string; label: string; current: boolean }

type Rect = { left: number; width: number }

const SLIDE_MS = 280
const SLIDE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

// Where each switcher's pill last sat, so one that remounts on a route change (Bets and the
// Leaderboard re-render their page around it) still slides from the old tab instead of appearing.
const lastRect = new Map<string, Rect>()

// The mockup's segmented `.subnav`: full width on a phone, hugging its tabs from md. The active
// tab's pill slides between tabs like the main nav's does. Until the first layout effect the
// current tab draws its own pill, so the server-rendered page and a no-JS load look the same.
export function SubNav({ label, items }: { label: string; items: SubNavItem[] }) {
  const navRef = useRef<HTMLElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const currentHref = items.find((item) => item.current)?.href

  useLayoutEffect(() => {
    const nav = navRef.current
    const pill = pillRef.current
    if (!nav || !pill) return

    function place(): Rect | null {
      const current = nav!.querySelector<HTMLElement>('[aria-current="page"]')
      if (!current) return null
      const rect = { left: current.offsetLeft, width: current.offsetWidth }
      pill!.style.left = `${rect.left}px`
      pill!.style.width = `${rect.width}px`
      nav!.dataset.ready = ''
      return rect
    }

    const to = place()
    if (!to) {
      // No current tab (a page outside every section): nothing to show, nothing to slide from.
      delete nav.dataset.ready
      lastRect.delete(label)
      return
    }
    const from = lastRect.get(label)
    lastRect.set(label, to)
    if (from && (from.left !== to.left || from.width !== to.width) && typeof pill.animate === 'function' && !reducedMotion()) {
      pill.animate(
        [
          { left: `${from.left}px`, width: `${from.width}px` },
          { left: `${to.left}px`, width: `${to.width}px` },
        ],
        { duration: SLIDE_MS, easing: SLIDE_EASE },
      )
    }

    // A rotation or a resize moves the tabs without changing which is current: follow it in place.
    const observer = new ResizeObserver(() => {
      const rect = place()
      if (rect) lastRect.set(label, rect)
    })
    observer.observe(nav)
    return () => observer.disconnect()
  }, [label, currentHref])

  return (
    <nav
      ref={navRef}
      aria-label={label}
      className="group/subnav no-callout relative flex gap-1 rounded-[14px] bg-sunk p-1 md:self-start"
    >
      <span
        ref={pillRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-1 bottom-1 rounded-[10px] bg-surface opacity-0 shadow-tab group-data-[ready]/subnav:opacity-100"
      />
      {items.map(({ href, label: itemLabel, current }) => (
        <Link
          key={href}
          href={href}
          aria-current={current ? 'page' : undefined}
          className={cn(
            'pressable relative inline-flex min-h-11 grow items-center justify-center rounded-[10px] px-2 text-[15px] font-bold no-underline md:grow-0 md:px-4',
            current
              ? 'bg-surface text-ink shadow-tab group-data-[ready]/subnav:bg-transparent group-data-[ready]/subnav:shadow-none'
              : 'text-ink2 hover:text-ink',
          )}
        >
          {itemLabel}
        </Link>
      ))}
    </nav>
  )
}
