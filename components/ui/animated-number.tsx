'use client'

import NumberFlow from '@number-flow/react'
import { useState, type ComponentProps } from 'react'
import { useMotionSettingReduced } from '@/lib/ui/reduced-motion'

// A number counts only once it changes after mount (#383): a page load shows the final figure at
// once, and the balance after a bet or a live chance moving still counts. NumberFlow already stills
// itself for the device's reduced-motion setting; this adds the app's own.
export function AnimatedNumber(props: ComponentProps<typeof NumberFlow>) {
  const reduced = useMotionSettingReduced()
  const [first] = useState(props.value)
  const [changed, setChanged] = useState(false)
  if (!changed && props.value !== first) setChanged(true)
  return <NumberFlow {...props} animated={changed && !reduced && props.animated !== false} />
}
