'use client'

import { useEffect } from 'react'
import { clearNotInvitedEmailAction } from '@/lib/auth/clear-not-invited-email'

// The page has shown the refused email; it needn't outlive this visit.
export function ClearNotInvitedEmail() {
  useEffect(() => {
    clearNotInvitedEmailAction().catch(() => {})
  }, [])
  return null
}
