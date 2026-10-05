'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { VoidForm } from './void-form'

// Calling a market off refunds everything, so its form waits behind one more deliberate tap
// (#390); the confirm dialog still follows. Revealing it moves focus to the reason field.
export function VoidDisclosure({ marketId }: { marketId: string }) {
  const [shown, setShown] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (shown) formRef.current?.querySelector('textarea')?.focus()
  }, [shown])

  if (!shown) {
    return (
      <Button variant="secondary" size="sm" aria-expanded={false} className="self-start" onClick={() => setShown(true)}>
        Call off market…
      </Button>
    )
  }
  return (
    <div ref={formRef}>
      <VoidForm marketId={marketId} />
    </div>
  )
}
