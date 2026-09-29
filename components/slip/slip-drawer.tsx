'use client'

import { useEffect, useState, type MouseEvent, type RefObject } from 'react'
import { Drawer } from '@base-ui/react/drawer'
import { X } from 'lucide-react'
import { useSlip } from '@/components/slip/slip-provider'
import { SlipPanel } from '@/components/slip/slip-panel'
import { focusPageHeading } from '@/lib/ui/focus-page-heading'
import { useIsDesktop } from '@/lib/ui/use-is-desktop'
import { cn } from '@/lib/utils'

const EASE = 'transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:select-none data-swiping:duration-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] motion-reduce:transition-none'

// The slip itself, as a bottom sheet on a phone and a panel from the right on desktop. SlipSheet
// loads it the first time the slip opens, keeping it off every page's first load.
export function SlipDrawer({
  onClosing,
  onClosed,
  returnFocusTo,
}: {
  onClosing: () => void
  onClosed: () => void
  // Where focus goes back to on close, or null for wherever it was when the slip opened.
  returnFocusTo: RefObject<HTMLElement | null>
}) {
  const { picks, open, setOpen } = useSlip()
  const isDesktop = useIsDesktop()
  // Base UI skips the enter transition of a drawer that mounts already open, which this one does
  // when the slip's first opening is what loads it. Mounting closed for a frame keeps the slide-in.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSettled(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  const count = picks.length

  function handleContentClick(event: MouseEvent<HTMLDivElement>) {
    // A link to the page already on screen doesn't navigate, so it would leave the slip stuck open.
    if ((event.target as HTMLElement).closest('a')) setOpen(false)
  }

  return (
    <Drawer.Root
      open={open && settled}
      swipeDirection={isDesktop ? 'right' : 'down'}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onClosing()
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed()
      }}
    >
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 z-40 bg-scrim opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] motion-reduce:transition-none" />
          <Drawer.Viewport className={cn('fixed inset-0 z-40 flex', isDesktop ? 'justify-end' : 'items-end justify-center')}>
            <Drawer.Popup
              aria-labelledby="slip-title"
              finalFocus={count === 0 ? focusPageHeading : () => returnFocusTo.current ?? true}
              className={cn(
                'flex flex-col border-line bg-bg text-ink shadow-overlay outline-none',
                EASE,
                isDesktop
                  ? 'h-full w-[440px] max-w-full border-l pt-(--safe-top) [transform:translateX(var(--drawer-swipe-movement-x))] data-starting-style:[transform:translateX(100%)] data-ending-style:[transform:translateX(100%)]'
                  : 'max-h-[calc(100dvh-48px-var(--safe-top))] w-full rounded-t-card border border-b-0 [transform:translateY(var(--drawer-swipe-movement-y))] data-starting-style:[transform:translateY(100%)] data-ending-style:[transform:translateY(100%)]',
              )}
            >
              <div className="relative flex shrink-0 justify-end px-2 pt-2">
                {!isDesktop && (
                  <span aria-hidden="true" className="absolute top-2.5 left-1/2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-line-s" />
                )}
                <Drawer.Close
                  aria-label="Close slip"
                  className="pressable inline-flex size-11 cursor-pointer items-center justify-center rounded-control text-ink hover:bg-sunk"
                >
                  <X aria-hidden="true" className="size-[22px]" />
                </Drawer.Close>
              </div>
              <Drawer.Content
                onClick={handleContentClick}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(24px+var(--safe-bottom))] md:px-6"
              >
                <SlipPanel />
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  )
}
