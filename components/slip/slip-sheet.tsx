'use client'

import { useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Ticket } from 'lucide-react'
import { useSlip } from '@/components/slip/slip-provider'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const loadDrawer = () => import('@/components/slip/slip-drawer')
const SlipDrawer = dynamic(() => import('@/components/slip/slip-drawer').then((mod) => mod.SlipDrawer), { ssr: false })

// On every signed-in page while the slip has picks: a floating button that opens the slip. The
// drawer behind it loads the first time the slip opens, or as soon as the button is pointed at or
// focused, so it's usually there before the tap lands.
export function SlipSheet() {
  const { picks, open, setOpen } = useSlip()
  // Keeps the popup mounted through Base UI's exit transition after `open` flips to false.
  const [closing, setClosing] = useState(false)
  const [wanted, setWanted] = useState(false)
  const returnFocusTo = useRef<HTMLElement | null>(null)
  if (open && !wanted) setWanted(true)
  const count = picks.length
  if (count === 0 && !open && !closing) return null

  function prepare() {
    void loadDrawer()
    setWanted(true)
  }

  return (
    <>
      {count > 0 && (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onPointerEnter={prepare}
          onPointerDown={prepare}
          onFocus={prepare}
          onClick={(event) => {
            returnFocusTo.current = event.currentTarget
            setOpen(true)
          }}
          className={cn(
            buttonVariants(),
            'fixed right-4 bottom-[calc(94px+var(--safe-bottom))] z-20 rounded-full tabular-nums shadow-overlay md:right-8 md:bottom-8',
          )}
        >
          <Ticket aria-hidden="true" className="size-5" />
          {`Slip (${count})`}
        </button>
      )}
      {wanted && (
        <SlipDrawer
          returnFocusTo={returnFocusTo}
          onClosing={() => setClosing(true)}
          onClosed={() => {
            setClosing(false)
            returnFocusTo.current = null
          }}
        />
      )}
    </>
  )
}

// Room at the bottom of the page, so the floating button never covers its last content.
export function SlipSpacer() {
  const { picks } = useSlip()
  return picks.length > 0 ? <div aria-hidden="true" className="h-16 shrink-0" /> : null
}
