'use client'

import { useCallback, useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from 'react'
import { PILL_SLIDE } from '@/lib/ui/motion'
import { reducedMotion } from '@/lib/ui/reduced-motion'
import { cn } from '@/lib/utils'

type Rect = { left: number; width: number }

// Where each remembered control's pill last sat, so one that remounts on a route change (SubNav on
// Bets and the Leaderboard re-renders with its page) still slides from the old segment.
const lastRect = new Map<string, Rect>()

// The chosen segment, before script places the pill and on a no-JS load, draws its own pill; once
// the control is ready the sliding pill takes over. The border keeps the active indicator at 3:1
// on `sunk` (#268).
const ACTIVE_SEGMENT =
  'border border-ink2 bg-segment-active text-ink shadow-tab group-data-[ready]/segmented:border-transparent group-data-[ready]/segmented:bg-transparent group-data-[ready]/segmented:shadow-none'

export function segmentClass(active: boolean): string {
  return cn(
    'pressable relative inline-flex min-h-11 cursor-pointer items-center justify-center rounded-segment px-3 font-bold no-underline',
    active ? ACTIVE_SEGMENT : 'text-ink2 hover:text-ink',
  )
}

// Spread on the chosen segment, so the pill can find it whatever element the segment is.
export function segmentMarker(active: boolean): { 'data-segment-active'?: '' } {
  return active ? { 'data-segment-active': '' } : {}
}

// The pill slides on transforms alone (ST-8): animating left and width ran layout every frame, and
// scaling one rounded, bordered box squashes its corners. So its fill is three pieces: two caps,
// each a whole rounded box clipped to its outer half (a box with only two corners rounded draws a
// different curve), which only move, and a middle carrying just the top and bottom borders, which
// scaleX stretches without thickening. The shadow is one box under them all, stretched with the
// pill: only its soft edge shows, and it's exact again when the slide ends.
const CAP = 'absolute inset-y-0 w-[calc(var(--radius-segment)*2)] rounded-segment border border-ink2 bg-segment-active'

function slide(pill: HTMLElement, from: Rect, to: Rect) {
  const end = pill.querySelector<HTMLElement>('[data-pill-end]')!
  const middle = pill.querySelector<HTMLElement>('[data-pill-middle]')!
  const shadow = pill.querySelector<HTMLElement>('[data-pill-shadow]')!
  const translateX = (by: number) => [{ transform: `translateX(${by}px)` }, { transform: 'translateX(0)' }]
  const scaleX = (fromWidth: number, toWidth: number) => [{ transform: `scaleX(${fromWidth / toWidth})` }, { transform: 'scaleX(1)' }]
  pill.animate(translateX(from.left - to.left), PILL_SLIDE)
  end.animate(translateX(from.width - to.width), PILL_SLIDE)
  // The middle runs a pixel under each cap, so no seam opens between them mid-slide.
  const capsInset = end.offsetWidth - 2
  middle.animate(scaleX(from.width - capsInset, to.width - capsInset), PILL_SLIDE)
  shadow.animate(scaleX(from.width, to.width), PILL_SLIDE)
}

// One segmented control: a `sunk` track with one outer radius, segments with the inner one, and a
// pill that slides to the chosen segment on PILL_SLIDE. The semantics stay the caller's: SubNav's
// links carry aria-current, the theme control's segments are radio labels, and the slip's and the
// chart's are pressed buttons. `activeKey` changes when the choice does; `memoryKey` keeps the
// pill's last place across remounts.
export function SegmentedControl({
  as = 'div',
  activeKey,
  memoryKey,
  className,
  children,
  ...rest
}: {
  as?: 'div' | 'nav'
  activeKey: string | undefined
  memoryKey?: string
  className?: string
  children: ReactNode
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
  const trackRef = useRef<HTMLElement | null>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const localRect = useRef<Rect | null>(null)
  const setTrack = useCallback((el: HTMLElement | null) => {
    trackRef.current = el
  }, [])

  useLayoutEffect(() => {
    const track = trackRef.current
    const pill = pillRef.current
    if (!track || !pill) return

    const remember = (rect: Rect | null) => {
      if (memoryKey === undefined) localRect.current = rect
      else if (rect) lastRect.set(memoryKey, rect)
      else lastRect.delete(memoryKey)
    }

    function place(): Rect | null {
      const active = track!.querySelector<HTMLElement>('[data-segment-active]')
      if (!active) return null
      const rect = { left: active.offsetLeft, width: active.offsetWidth }
      pill!.style.left = `${rect.left}px`
      pill!.style.width = `${rect.width}px`
      track!.dataset.ready = ''
      return rect
    }

    const from = memoryKey === undefined ? localRect.current : lastRect.get(memoryKey)
    const to = place()
    if (!to) {
      // Nothing chosen (a page outside every section): nothing to show, nothing to slide from.
      delete track.dataset.ready
      remember(null)
      return
    }
    remember(to)
    if (from && (from.left !== to.left || from.width !== to.width) && typeof pill.animate === 'function' && !reducedMotion()) {
      slide(pill, from, to)
    }

    // A rotation or a resize moves the segments without changing which is chosen: follow in place.
    const observer = new ResizeObserver(() => {
      const rect = place()
      if (rect) remember(rect)
    })
    observer.observe(track)
    return () => observer.disconnect()
  }, [activeKey, memoryKey])

  const Tag = as
  return (
    <Tag ref={setTrack} className={cn('group/segmented no-callout relative flex gap-1 rounded-tile bg-sunk p-1', className)} {...rest}>
      <span
        ref={pillRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-1 bottom-1 opacity-0 group-data-[ready]/segmented:opacity-100"
      >
        <span data-pill-shadow="" className="absolute inset-0 origin-left rounded-segment shadow-tab" />
        <span
          data-pill-middle=""
          className="absolute inset-y-0 right-[calc(var(--radius-segment)-1px)] left-[calc(var(--radius-segment)-1px)] origin-left border-y border-ink2 bg-segment-active"
        />
        <span className={cn(CAP, 'left-0 [clip-path:inset(-1px_50%_-1px_-1px)]')} />
        <span data-pill-end="" className={cn(CAP, 'right-0 [clip-path:inset(-1px_-1px_-1px_50%)]')} />
      </span>
      {children}
    </Tag>
  )
}
