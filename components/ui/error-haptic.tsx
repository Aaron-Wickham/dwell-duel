'use client'

import { useEffect } from 'react'
import { haptics } from '@/lib/haptics'

// Mounted by an error Message, so it buzzes when an inline error appears. It doesn't buzz
// again while the same message stays on screen.
export function ErrorHaptic() {
  useEffect(() => {
    haptics.error()
  }, [])
  return null
}
