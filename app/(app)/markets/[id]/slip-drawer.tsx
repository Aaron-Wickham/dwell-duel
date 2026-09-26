'use client'

import { useState, type MouseEvent } from 'react'
import { Drawer } from '@base-ui/react/drawer'
import { Layers, X } from 'lucide-react'
import { useSlipCount } from '@/components/app-nav/slip-count'
import { SlipForm } from '@/app/(app)/parlays/slip-form'
import { buttonVariants } from '@/components/ui/button'
import { focusPageHeading } from '@/lib/ui/focus-page-heading'
import type { SlipView } from '@/lib/parlays/get-slip'
import { cn } from '@/lib/utils'

export function SlipDrawer({ slip }: { slip: SlipView }) {
  const [open, setOpen] = useState(false)
  // Tearing this component down the instant `open` flips to false would unmount the popup
  // before Base UI's `data-ending-style` exit transition gets to play. `closing` keeps it
  // mounted until `onOpenChangeComplete(false)` confirms the close animation has finished.
  const [closing, setClosing] = useState(false)
  const count = slip.picks.length
  // Whether the trigger mounts at all stays tied to the server's count -- it only ever
  // appears once the server confirms a pick is there. Its label follows the nav's optimistic
  // count instead, so it doesn't lag behind the tab bar's badge by a request.
  const { count: badgeCount } = useSlipCount()
  if (count === 0 && !open && !closing) return null

  function handleContentClick(event: MouseEvent<HTMLDivElement>) {
    // A link to the market already on screen doesn't navigate, so it would otherwise leave
    // the sheet stuck open. Close on any link click; navigating away closes it anyway.
    if ((event.target as HTMLElement).closest('a')) setOpen(false)
  }

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setClosing(true)
      }}
      onOpenChangeComplete={(next) => {
        if (!next) setClosing(false)
      }}
    >
      {count > 0 && (
        <>
          <div aria-hidden="true" className="h-8 md:hidden" />
          <Drawer.Trigger
            className={cn(
              buttonVariants(),
              'fixed right-4 bottom-[calc(94px+var(--safe-bottom))] z-20 rounded-full tabular-nums shadow-overlay md:hidden',
            )}
          >
            <Layers aria-hidden="true" className="size-5" />
            {`Slip (${badgeCount})`}
          </Drawer.Trigger>
        </>
      )}
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 z-40 bg-scrim opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] motion-reduce:transition-none" />
          <Drawer.Viewport className="fixed inset-0 z-40 flex items-end justify-center">
            <Drawer.Popup
              aria-labelledby="slip-title"
              finalFocus={count === 0 ? focusPageHeading : true}
              className="flex max-h-[calc(100dvh-48px-var(--safe-top))] w-full flex-col rounded-t-card border border-b-0 border-line bg-bg text-ink shadow-overlay outline-none [transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:select-none data-swiping:duration-0 data-starting-style:[transform:translateY(100%)] data-ending-style:[transform:translateY(100%)] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] motion-reduce:transition-none"
            >
              <div className="relative flex shrink-0 justify-end px-2 pt-2">
                <span aria-hidden="true" className="absolute top-2.5 left-1/2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-line-s" />
                <Drawer.Close
                  aria-label="Close slip"
                  className="pressable inline-flex size-11 cursor-pointer items-center justify-center rounded-control text-ink hover:bg-sunk"
                >
                  <X aria-hidden="true" className="size-[22px]" />
                </Drawer.Close>
              </div>
              <Drawer.Content
                onClick={handleContentClick}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(24px+var(--safe-bottom))]"
              >
                <SlipForm slip={slip} />
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  )
}
