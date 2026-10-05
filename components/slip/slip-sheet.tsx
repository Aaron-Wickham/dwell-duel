'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Ticket } from 'lucide-react'
import { useSlip } from '@/components/slip/slip-provider'
import { buttonVariants } from '@/components/ui/button'
import { DURATION } from '@/lib/ui/motion'
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
  // The button rises in with the first pick and fades out after the last (#384): it stays mounted,
  // inert, showing the last count, while it leaves. One already there when the page loads just shows.
  const [shownCount, setShownCount] = useState(count)
  const [leaving, setLeaving] = useState(false)
  const [presentAtLoad, setPresentAtLoad] = useState(count > 0)
  if (count > 0 && (count !== shownCount || leaving)) {
    setShownCount(count)
    setLeaving(false)
  }
  if (count === 0 && shownCount > 0 && !leaving) setLeaving(true)

  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => {
      setLeaving(false)
      setShownCount(0)
      setPresentAtLoad(false)
    }, DURATION.fast)
    return () => clearTimeout(timer)
  }, [leaving])

  if (shownCount === 0 && !open && !closing) return null

  function prepare() {
    void loadDrawer()
    setWanted(true)
  }

  return (
    <>
      {shownCount > 0 && (
        <div
          data-enter={presentAtLoad ? undefined : ''}
          data-leaving={leaving || undefined}
          inert={leaving}
          className="slip-fab fixed right-4 bottom-[calc(94px+var(--safe-bottom))] z-20 md:right-8 md:bottom-8"
        >
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
            className={cn(buttonVariants(), 'rounded-full shadow-overlay')}
          >
            <Ticket aria-hidden="true" className="size-5" />
            {`Slip (${shownCount})`}
          </button>
        </div>
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
