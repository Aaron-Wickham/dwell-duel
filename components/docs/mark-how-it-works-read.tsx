'use client'

import { useEffect } from 'react'
import { markHowItWorksRead } from '@/lib/home/how-it-works-read'

export function MarkHowItWorksRead() {
  useEffect(() => {
    markHowItWorksRead()
  }, [])
  return null
}
