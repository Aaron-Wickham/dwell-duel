'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useNavDepth } from '@/lib/nav/nav-depth'
import { BACK_SWIPE_EDGE, BACK_SWIPE_SLOP, backSwipeDecision, logicalParent } from '@/lib/nav/back-swipe'

const SETTLE_MS = 280
const SETTLE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
// Release velocity comes from the last 100ms of movement; a finger that stopped before lifting has none.
const VELOCITY_WINDOW_MS = 100
// If the navigation never unmounts this page (a failed or offline push), give the page back.
const STUCK_RESET_MS = 4000

type Sample = { x: number; t: number }
type Start = { x: number; y: number; id: number }

function touchWithId(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i++) {
    if (list[i].identifier === id) return list[i]
  }
  return null
}

export function BackSwipe({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const depth = useNavDepth()
  const contentRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const latest = useRef({ router, pathname, depth })
  const resetRef = useRef<() => void>(() => {})
  const isFirstPathname = useRef(true)

  useEffect(() => {
    latest.current = { router, pathname, depth }
  }, [router, pathname, depth])

  useEffect(() => {
    // The admin layout keeps one BackSwipe mounted across its sections: a completed swipe leaves
    // the DOM off-screen and `busy` set until the route underneath it changes.
    if (isFirstPathname.current) {
      isFirstPathname.current = false
      return
    }
    resetRef.current()
  }, [pathname])

  useEffect(() => {
    const content = contentRef.current
    const backdrop = backdropRef.current
    if (!content || !backdrop) return

    let start: Start | null = null
    let dragging = false
    let busy = false
    let reduceMotion = false
    let samples: Sample[] = []
    let timer: number | undefined

    function paint(dx: number) {
      content!.style.transform = `translate3d(${dx}px, 0, 0)`
      backdrop!.style.opacity = String(1 - Math.min(dx / window.innerWidth, 1))
    }

    function lift() {
      content!.dataset.swiping = ''
      backdrop!.dataset.swiping = ''
      content!.style.transition = 'none'
      backdrop!.style.transition = 'none'
    }

    function reset() {
      window.clearTimeout(timer)
      busy = false
      delete content!.dataset.swiping
      delete backdrop!.dataset.swiping
      content!.style.transform = ''
      content!.style.transition = ''
      backdrop!.style.opacity = ''
      backdrop!.style.transition = ''
    }
    resetRef.current = reset

    function settle(toX: number, then: () => void) {
      busy = true
      content!.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASE}`
      backdrop!.style.transition = `opacity ${SETTLE_MS}ms ${SETTLE_EASE}`
      paint(toX)
      timer = window.setTimeout(then, SETTLE_MS)
    }

    function navigateBack() {
      const { router, pathname, depth } = latest.current
      // A history traversal commits synchronously inside popstate, so it never runs a view
      // transition; the page has already slid off under the finger by then.
      if (depth > 0) {
        router.back()
      } else {
        router.push(logicalParent(pathname), { transitionTypes: ['nav-back'] })
      }
    }

    function release(velocity: number, dx: number, dy: number) {
      const decision = backSwipeDecision({ dx, dy, width: window.innerWidth, velocity })
      if (decision !== 'complete') {
        if (reduceMotion) reset()
        else settle(0, reset)
        return
      }
      if (reduceMotion) {
        busy = true
        navigateBack()
        timer = window.setTimeout(reset, STUCK_RESET_MS)
        return
      }
      settle(window.innerWidth, () => {
        navigateBack()
        timer = window.setTimeout(reset, STUCK_RESET_MS)
      })
    }

    function stopTracking() {
      start = null
      dragging = false
      samples = []
    }

    function onTouchStart(event: TouchEvent) {
      if (busy) return
      if (start) {
        // A second finger touching down mid-swipe cancels it, the same as the system cancelling.
        reset()
        stopTracking()
        return
      }
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      if (touch.clientX > BACK_SWIPE_EDGE) return
      // Base UI only mounts a drawer or dialog popup while it's open.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      start = { x: touch.clientX, y: touch.clientY, id: touch.identifier }
      samples = [{ x: touch.clientX, t: event.timeStamp }]
      reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }

    function onTouchMove(event: TouchEvent) {
      if (!start) return
      if (event.touches.length !== 1) {
        if (dragging) release(0, 0, 0)
        stopTracking()
        return
      }
      const touch = touchWithId(event.touches, start.id)
      if (!touch) return
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      if (!dragging) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < BACK_SWIPE_SLOP) return
        if (dx <= 0 || backSwipeDecision({ dx, dy, width: window.innerWidth, velocity: 0 }) === 'ignore') {
          stopTracking()
          return
        }
        dragging = true
        if (!reduceMotion) lift()
      }
      // Once the swipe owns the touch, the page mustn't scroll under the finger.
      if (event.cancelable) event.preventDefault()
      samples.push({ x: touch.clientX, t: event.timeStamp })
      while (samples.length > 2 && samples[0].t < event.timeStamp - VELOCITY_WINDOW_MS) samples.shift()
      if (!reduceMotion) paint(Math.max(0, dx))
    }

    function onTouchEnd(event: TouchEvent) {
      if (!start) return
      const touch = touchWithId(event.changedTouches, start.id)
      if (!touch) return
      if (!dragging) {
        stopTracking()
        return
      }
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      const first = samples[0]
      const last = samples[samples.length - 1]
      const fresh = event.timeStamp - last.t <= VELOCITY_WINDOW_MS
      const velocity = fresh && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0
      stopTracking()
      release(velocity, dx, dy)
    }

    function onTouchCancel() {
      if (!start) return
      const wasDragging = dragging
      stopTracking()
      if (wasDragging) release(0, 0, 0)
    }

    function onPageShow(event: PageTransitionEvent) {
      // A page restored from the back-forward cache comes back mid-swipe otherwise.
      if (event.persisted) reset()
    }

    // touchmove stays registered, non-passive, for the page's lifetime: a listener added mid-gesture
    // isn't promised cancelable moves on iOS. It returns at once unless a touch began at the edge.
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('touchcancel', onTouchCancel, { passive: true })
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchCancel)
      window.removeEventListener('pageshow', onPageShow)
      reset()
    }
  }, [])

  return (
    <div className="flex flex-1 touch-pan-y touch-pinch-zoom flex-col overflow-x-clip">
      <div
        ref={backdropRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-20 hidden bg-scrim data-swiping:block"
      />
      <div
        ref={contentRef}
        className="flex flex-1 flex-col data-swiping:relative data-swiping:z-[21] data-swiping:bg-bg data-swiping:shadow-overlay"
      >
        {children}
      </div>
    </div>
  )
}
