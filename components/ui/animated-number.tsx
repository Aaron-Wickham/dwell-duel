'use client'

import NumberFlow from '@number-flow/react'
import type { ComponentProps } from 'react'
import { useMotionSettingReduced } from '@/lib/ui/reduced-motion'

// NumberFlow already stills itself for the device's reduced-motion setting; this adds the app's own.
export function AnimatedNumber(props: ComponentProps<typeof NumberFlow>) {
  const reduced = useMotionSettingReduced()
  return <NumberFlow {...props} animated={!reduced && props.animated !== false} />
}
