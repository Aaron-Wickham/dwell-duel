'use client'

import { Fragment, useId, useLayoutEffect, useRef } from 'react'
import { AttentionBadge, AttentionNote } from '@/components/ui/attention-badge'
import { IntentLink } from '@/components/ui/intent-link'
import { PILL_SLIDE } from '@/lib/ui/motion'
import { reducedMotion } from '@/lib/ui/reduced-motion'
import { cn } from '@/lib/utils'

// badge: how many things wait on the viewer behind this tab, drawn as the top bar's badge.
export type SubNavItem = { href: string; label: string; current: boolean; badge?: number }

type Rect = { left: number; width: number }

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
  const noteId = useId()

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
        PILL_SLIDE,
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
        className="pointer-events-none absolute top-1 bottom-1 rounded-[10px] border border-ink2 bg-surface opacity-0 shadow-tab group-data-[ready]/subnav:opacity-100"
      />
      {items.map(({ href, label: itemLabel, current, badge = 0 }, index) => (
        <Fragment key={href}>
          <IntentLink
            prefetchOnTouch
            href={href}
            aria-current={current ? 'page' : undefined}
            aria-describedby={badge > 0 ? `${noteId}-${index}` : undefined}
            className={cn(
              'pressable relative inline-flex min-h-11 grow items-center justify-center rounded-[10px] px-1.5 text-[15px] font-bold no-underline sm:px-2 md:grow-0 md:px-4',
              current
                ? 'border border-ink2 bg-surface text-ink shadow-tab group-data-[ready]/subnav:border-transparent group-data-[ready]/subnav:bg-transparent group-data-[ready]/subnav:shadow-none'
                : 'text-ink2 hover:text-ink',
            )}
          >
            {badge > 0 ? (
              // The badge hangs off the label's corner rather than taking width, so five tabs
              // still fit a phone on one line.
              <span className="relative">
                {itemLabel}
                <AttentionBadge count={badge} className={cn('-top-2.5 -right-4', current ? 'ring-surface' : 'ring-sunk')} />
              </span>
            ) : (
              itemLabel
            )}
          </IntentLink>
          {/* Outside the link, so the tab's name stays its label and the count is its description. */}
          <AttentionNote id={`${noteId}-${index}`} count={badge} />
        </Fragment>
      ))}
    </nav>
  )
}
