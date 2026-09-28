'use client'

import { useState } from 'react'
import { LeafLoader } from '@/components/brand/leaf-loader'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Still a plain empty-href link, so it reloads the URL the member was opening even if this script
// never loads. With it, the link shows it's working while the reload waits on the network.
export function TryAgainLink() {
  const [trying, setTrying] = useState(false)
  return (
    <a
      href=""
      onClick={() => setTrying(true)}
      className={cn(buttonVariants({ variant: 'primary', block: true }), 'md:w-auto')}
    >
      {trying ? (
        <>
          <LeafLoader />
          <span role="status">Trying again…</span>
        </>
      ) : (
        'Try again'
      )}
    </a>
  )
}
