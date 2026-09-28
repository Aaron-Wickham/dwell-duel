'use client'

import { useState, type MouseEvent } from 'react'
import { Drawer } from '@base-ui/react/drawer'
import { Ticket, X } from 'lucide-react'
import { useSlip } from '@/components/slip/slip-provider'
import { SlipPanel } from '@/components/slip/slip-panel'
import { buttonVariants } from '@/components/ui/button'
import { focusPageHeading } from '@/lib/ui/focus-page-heading'
import { useIsDesktop } from '@/lib/ui/use-is-desktop'
import { cn } from '@/lib/utils'

const EASE = 'transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:select-none data-swiping:duration-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] motion-reduce:transition-none'

// On every signed-in page while the slip has picks: a floating button that opens the slip, as a
// bottom sheet on a phone and a panel from the right on desktop.
export function SlipSheet() {
  const { picks, open, setOpen } = useSlip()
  const isDesktop = useIsDesktop()
  // Keeps the popup mounted through Base UI's exit transition after `open` flips to false.
  const [closing, setClosing] = useState(false)
  const count = picks.length
  if (count === 0 && !open && !closing) return null

  function handleContentClick(event: MouseEvent<HTMLDivElement>) {
    // A link to the page already on screen doesn't navigate, so it would leave the slip stuck open.
    if ((event.target as HTMLElement).closest('a')) setOpen(false)
  }

  return (
    <Drawer.Root
      open={open}
      swipeDirection={isDesktop ? 'right' : 'down'}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setClosing(true)
      }}
      onOpenChangeComplete={(next) => {
        if (!next) setClosing(false)
      }}
    >
      {count > 0 && (
        <Drawer.Trigger
          className={cn(
            buttonVariants(),
            'fixed right-4 bottom-[calc(94px+var(--safe-bottom))] z-20 rounded-full tabular-nums shadow-overlay md:right-8 md:bottom-8',
          )}
        >
          <Ticket aria-hidden="true" className="size-5" />
          {`Slip (${count})`}
        </Drawer.Trigger>
      )}
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 z-40 bg-scrim opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] motion-reduce:transition-none" />
          <Drawer.Viewport className={cn('fixed inset-0 z-40 flex', isDesktop ? 'justify-end' : 'items-end justify-center')}>
            <Drawer.Popup
              aria-labelledby="slip-title"
              finalFocus={count === 0 ? focusPageHeading : true}
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

// Room at the bottom of the page, so the floating button never covers its last content.
export function SlipSpacer() {
  const { picks } = useSlip()
  return picks.length > 0 ? <div aria-hidden="true" className="h-16 shrink-0" /> : null
}
