'use client'

import { usePathname, useRouter } from 'next/navigation'
import { BackLink } from '@/components/ui/back-link'
import { logicalParent } from '@/lib/nav/back-swipe'
import { useNavDepth } from '@/lib/nav/nav-depth'

// For a page reached from several places, like a member's profile: it goes back the way the
// back-swipe does, to wherever the member came from, and with no in-app history (a deep link) to
// the page's logical parent. That parent is also the href, so the link works before hydration.
export function HistoryBackLink() {
  const pathname = usePathname()
  const router = useRouter()
  const depth = useNavDepth()

  return (
    <BackLink
      href={logicalParent(pathname)}
      onClick={(event) => {
        if (depth === 0 || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        router.back()
      }}
    >
      Back
    </BackLink>
  )
}
